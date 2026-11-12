import { describe, expect, it } from 'vitest';
import { createConsumerHandler, upsertLatestInventory } from '../src/consumer';
import { keys } from '../src/keys';
import { parseShopifyJson } from '../src/json';
import type { QueueMessage } from '../src/ports';
import { fixture, memoryStore, sqsEvent } from './helpers';

const SHOP = 'lab-dev.myshopify.com';

function message(topic: string, payload: unknown, webhookId = 'wh-1'): QueueMessage {
  return { webhookId, topic, shopDomain: SHOP, triggeredAt: null, apiVersion: '2026-10', receivedAt: '2026-11-12T18:15:01.000Z', payload };
}

const inventory = (available: number, updatedAt: string) => ({ ...(parseShopifyJson(fixture('inventory-levels-update.json')) as object), available, updated_at: updatedAt });

describe('SQS consumer', () => {
  it('writes the raw event and a normalized order to S3, once', async () => {
    const store = memoryStore();
    const consume = createConsumerHandler({ store });
    const msg = message('orders/create', parseShopifyJson(fixture('orders-create.json')));

    expect(await consume(sqsEvent([msg, msg]))).toEqual({ batchItemFailures: [] });

    const orderKey = 'orders/shop=lab-dev.myshopify.com/date=2026-11-12/820982911946154508.json';
    expect(JSON.parse(store.objects.get(orderKey)!.body)).toMatchObject({
      orderId: 'gid://shopify/Order/820982911946154508',
      presentmentCurrency: 'CAD',
      totalDiscounts: '20.00',
      lineItems: [{ variantId: 'gid://shopify/ProductVariant/39072856', sku: 'KB-TKL-01', quantity: 1 }, {}, {}],
    });
    expect(store.objects.has(keys.rawEvent('orders/create', SHOP, msg.receivedAt, 'wh-1'))).toBe(true);
    expect(store.objects.size).toBe(2);
  });

  it('keeps the newest inventory level when webhooks arrive out of order', async () => {
    const store = memoryStore();
    const consume = createConsumerHandler({ store });
    await consume(
      sqsEvent([
        message('inventory_levels/update', inventory(5, '2026-11-12T10:20:00-08:00'), 'wh-new'),
        message('inventory_levels/update', inventory(9, '2026-11-12T10:10:00-08:00'), 'wh-old'),
      ]),
    );
    const latest = store.objects.get(keys.inventoryLatest(SHOP, 'gid://shopify/InventoryItem/271878346596884015', 'gid://shopify/Location/24826418'));
    expect(JSON.parse(latest!.body)).toMatchObject({ available: 5, webhookId: 'wh-new' });
  });

  it('retries a conditional-write conflict and never overwrites a newer value', async () => {
    const store = memoryStore();
    const originalPut = store.put.bind(store);
    let raced = false;
    store.put = async (key, body, condition) => {
      if (!raced && condition?.ifMatch) {
        raced = true; // another consumer lands a newer update between our read and write
        await originalPut(key, JSON.stringify({ ...JSON.parse(body), available: 1, updatedAt: '2026-11-12T11:00:00-08:00' }));
      }
      return originalPut(key, body, condition);
    };
    const obs = { inventoryItemId: 'gid://shopify/InventoryItem/1', locationId: 'gid://shopify/Location/2', available: 3, webhookId: 'a' };
    await upsertLatestInventory(store, SHOP, { ...obs, updatedAt: '2026-11-12T09:00:00-08:00' });
    await expect(upsertLatestInventory(store, SHOP, { ...obs, available: 4, updatedAt: '2026-11-12T10:00:00-08:00' })).resolves.toBe('stale-ignored');
    expect(JSON.parse([...store.objects.values()].at(-1)!.body).available).toBe(1);
  });

  it('reports only the failing records for redelivery (partial batch response)', async () => {
    const consume = createConsumerHandler({ store: memoryStore() });
    const res = await consume(
      sqsEvent([message('orders/create', parseShopifyJson(fixture('orders-create.json'))), 'not json', message('orders/create', { id: 'bad' }, 'wh-2')]),
    );
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }, { itemIdentifier: 'msg-2' }]);
  });
});
