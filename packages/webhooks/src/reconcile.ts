import { findDrift, getInventorySnapshot, type AdminClient, type Drift, type ObservedLevel } from '@commerce-lab/pricing';
import { keys } from './keys';
import type { InventoryObservation } from './normalize';
import type { ObjectStore } from './ports';

export interface ReconcileDeps {
  store: ObjectStore;
  admin: AdminClient;
  shop: string;
  /** Cap Admin API calls per run (cost-based rate limits). */
  maxItems?: number;
  now?: () => Date;
}

export interface ReconcileReport {
  shop: string;
  runAt: string;
  itemsChecked: number;
  itemsSkipped: number;
  drift: Drift[];
  reportKey: string;
}

/**
 * Scheduled (EventBridge) reconciliation. Webhook delivery isn't guaranteed,
 * so periodically compare the inventory picture built from webhooks with
 * Shopify's live levels and write a drift report next to the data.
 */
export async function reconcileInventory({ store, admin, shop, maxItems = 50, now = () => new Date() }: ReconcileDeps): Promise<ReconcileReport> {
  const runAt = now().toISOString();
  const observedByItem = new Map<string, ObservedLevel[]>();
  for (const key of await store.list(keys.inventoryLatestPrefix(shop))) {
    const object = await store.get(key);
    if (!object) continue;
    const obs = JSON.parse(object.body) as InventoryObservation;
    const list = observedByItem.get(obs.inventoryItemId) ?? [];
    list.push({ inventoryItemId: obs.inventoryItemId, locationId: obs.locationId, available: obs.available, observedAt: obs.updatedAt });
    observedByItem.set(obs.inventoryItemId, list);
  }

  const items = [...observedByItem.keys()].sort();
  const toCheck = items.slice(0, maxItems);
  const drift: Drift[] = [];
  for (const inventoryItemId of toCheck) {
    const snapshot = await getInventorySnapshot(admin, inventoryItemId);
    drift.push(...findDrift(snapshot, observedByItem.get(inventoryItemId) ?? []));
  }

  const reportKey = keys.reconciliationReport(shop, runAt);
  const report: ReconcileReport = { shop, runAt, itemsChecked: toCheck.length, itemsSkipped: items.length - toCheck.length, drift, reportKey };
  await store.put(reportKey, JSON.stringify(report, null, 2));
  return report;
}
