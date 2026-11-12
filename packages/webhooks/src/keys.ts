import { legacyId } from './normalize';

/** S3 key layout (Hive-style partitions so Athena/Glue can query it later). */
const day = (iso: string) => iso.slice(0, 10);

export const keys = {
  rawEvent: (topic: string, shop: string, receivedAt: string, webhookId: string) =>
    `events/topic=${topic.replace('/', '_')}/shop=${shop}/date=${day(receivedAt)}/${webhookId}.json`,
  order: (shop: string, createdAt: string, orderId: string) => `orders/shop=${shop}/date=${day(createdAt)}/${legacyId(orderId)}.json`,
  inventoryLatestPrefix: (shop: string) => `inventory/latest/shop=${shop}/`,
  inventoryLatest: (shop: string, inventoryItemId: string, locationId: string) =>
    `inventory/latest/shop=${shop}/item=${legacyId(inventoryItemId)}/location=${legacyId(locationId)}.json`,
  reconciliationReport: (shop: string, runAt: string) => `reconciliation/shop=${shop}/date=${day(runAt)}/${runAt.replace(/[:.]/g, '-')}.json`,
};
