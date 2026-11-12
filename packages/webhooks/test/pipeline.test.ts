import { describe, expect, it } from 'vitest';
import type { AdminClient } from '@commerce-lab/pricing';
import { createConsumerHandler } from '../src/consumer';
import { createIngestHandler } from '../src/ingest';
import { reconcileInventory } from '../src/reconcile';
import { fixture, memoryDedupe, memoryQueue, memoryStore, signedRequest, sqsEvent, staticSecrets, SECRET } from './helpers';

/**
 * Whole pipeline in memory: signed Shopify request → ingest Lambda logic →
 * queue → SQS consumer → S3 layout → scheduled reconciliation against a mocked
 * Admin API. Same code paths the Lambdas run, minus the AWS SDK adapters.
 */
describe('webhook → SQS → S3 → reconciliation', () => {
  it('flows end to end and reports drift', async () => {
    const dedupe = memoryDedupe();
    const queue = memoryQueue();
    const store = memoryStore();
    const ingest = createIngestHandler({ secrets: staticSecrets(SECRET), dedupe, queue });
    const consume = createConsumerHandler({ store });

    const order = signedRequest(fixture('orders-create.json'));
    const level = signedRequest(fixture('inventory-levels-update.json'), { 'x-shopify-topic': 'inventory_levels/update', 'x-shopify-webhook-id': 'wh-inv-1' });
    for (const req of [order, level, order]) expect((await ingest(req)).statusCode).toBe(200);
    expect(queue.messages).toHaveLength(2);

    expect(await consume(sqsEvent(queue.messages))).toEqual({ batchItemFailures: [] });
    expect([...store.objects.keys()].filter((k) => !k.startsWith('events/'))).toEqual([
      'orders/shop=lab-dev.myshopify.com/date=2026-11-12/820982911946154508.json',
      'inventory/latest/shop=lab-dev.myshopify.com/item=271878346596884015/location=24826418.json',
    ]);

    // Shopify now says 4 available at that location (a later webhook was missed).
    const admin: AdminClient = {
      request: async () => ({
        data: {
          inventoryItem: {
            id: 'gid://shopify/InventoryItem/271878346596884015',
            sku: 'KB-TKL-01',
            tracked: true,
            inventoryLevels: {
              nodes: [
                {
                  id: 'lvl',
                  location: { id: 'gid://shopify/Location/24826418', name: 'Milpitas DC' },
                  quantities: [{ name: 'available', quantity: 4 }, { name: 'on_hand', quantity: 6 }],
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      }) as never,
    };
    const report = await reconcileInventory({ store, admin, shop: 'lab-dev.myshopify.com', now: () => new Date('2026-11-12T19:00:00.000Z') });
    expect(report).toMatchObject({
      itemsChecked: 1,
      drift: [{ locationId: 'gid://shopify/Location/24826418', shopify: 4, observed: 7, delta: -3 }],
      reportKey: 'reconciliation/shop=lab-dev.myshopify.com/date=2026-11-12/2026-11-12T19-00-00-000Z.json',
    });
    expect(store.objects.has(report.reportKey)).toBe(true);
  });
});
