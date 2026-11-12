import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { keys } from './keys';
import { normalizeInventoryLevel, normalizeOrder, type InventoryObservation } from './normalize';
import type { ObjectStore, QueueMessage } from './ports';

export interface ConsumerDeps {
  store: ObjectStore;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

export type ProcessOutcome = 'stored' | 'already-stored' | 'stale-ignored' | 'updated';

/**
 * Last-writer-wins by Shopify's updated_at, not by arrival order: webhooks can
 * arrive out of order, so an older update must never overwrite a newer one.
 * The S3 write is conditional on the ETag we read (optimistic concurrency), so
 * two consumers racing on the same item/location can't clobber each other.
 */
export async function upsertLatestInventory(store: ObjectStore, shop: string, obs: InventoryObservation, maxAttempts = 3): Promise<ProcessOutcome> {
  const key = keys.inventoryLatest(shop, obs.inventoryItemId, obs.locationId);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await store.get(key);
    if (current) {
      const existing = JSON.parse(current.body) as InventoryObservation;
      if (Date.parse(existing.updatedAt) >= Date.parse(obs.updatedAt)) return 'stale-ignored';
    }
    const written = await store.put(key, JSON.stringify(obs), current ? { ifMatch: current.etag } : { ifNoneMatch: '*' });
    if (written) return 'updated';
  }
  throw new Error(`Gave up writing ${key} after ${maxAttempts} conflicting attempts`);
}

export async function processMessage(store: ObjectStore, message: QueueMessage): Promise<ProcessOutcome> {
  // Keep the raw event (create-only, so SQS redelivery is harmless).
  await store.put(keys.rawEvent(message.topic, message.shopDomain, message.receivedAt, message.webhookId), JSON.stringify(message), {
    ifNoneMatch: '*',
  });

  switch (message.topic) {
    case 'orders/create': {
      const order = normalizeOrder(message.payload);
      const created = await store.put(keys.order(message.shopDomain, order.createdAt, order.orderId), JSON.stringify(order), {
        ifNoneMatch: '*',
      });
      return created ? 'stored' : 'already-stored';
    }
    case 'inventory_levels/update':
      return upsertLatestInventory(store, message.shopDomain, normalizeInventoryLevel(message.payload, message.webhookId));
    default:
      throw new Error(`Unsupported topic ${message.topic}`);
  }
}

/** SQS consumer with partial batch failures: only failed records are retried (then DLQ). */
export function createConsumerHandler({ store, log = () => {} }: ConsumerDeps) {
  return async function consume(event: SQSEvent): Promise<SQSBatchResponse> {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
    for (const record of event.Records) {
      try {
        const message = JSON.parse(record.body) as QueueMessage;
        const outcome = await processMessage(store, message);
        log('webhook.processed', { webhookId: message.webhookId, topic: message.topic, outcome });
      } catch (error) {
        log('webhook.failed', { messageId: record.messageId, error: String(error) });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  };
}
