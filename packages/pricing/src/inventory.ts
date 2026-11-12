import { execute, UserErrorsError, type AdminClient } from './client';
import type {
  InventoryLevelsQuery,
  InventoryLevelsQueryVariables,
  InventorySetQuantitiesMutation,
  InventorySetQuantitiesMutationVariables,
} from './generated/admin.types';
import { INVENTORY_LEVELS, INVENTORY_SET_QUANTITIES } from './graphql/operations';

export type QuantityName = 'available' | 'on_hand' | 'committed' | 'incoming';

export interface LocationLevel {
  locationId: string;
  locationName: string;
  quantities: Record<QuantityName, number>;
}

export interface InventorySnapshot {
  inventoryItemId: string;
  sku: string | null;
  tracked: boolean;
  levels: LocationLevel[];
  totals: Record<QuantityName, number>;
}

const NAMES: QuantityName[] = ['available', 'on_hand', 'committed', 'incoming'];
const zero = (): Record<QuantityName, number> => ({ available: 0, on_hand: 0, committed: 0, incoming: 0 });

export function summarize(levels: LocationLevel[]): Record<QuantityName, number> {
  const totals = zero();
  for (const level of levels) for (const name of NAMES) totals[name] += level.quantities[name];
  return totals;
}

/** Inventory for one item across all locations, with per-state totals. */
export async function getInventorySnapshot(client: AdminClient, inventoryItemId: string, pageSize = 50): Promise<InventorySnapshot> {
  const levels: LocationLevel[] = [];
  let after: string | null = null;
  let sku: string | null = null;
  let tracked = false;
  do {
    const data: InventoryLevelsQuery = await execute<InventoryLevelsQuery, InventoryLevelsQueryVariables>(client, INVENTORY_LEVELS, {
      inventoryItemId,
      first: pageSize,
      after,
    });
    const item = data.inventoryItem;
    if (!item) throw new UserErrorsError('inventoryItem', [{ code: 'NOT_FOUND', message: `Inventory item ${inventoryItemId} not found` }]);
    sku = item.sku ?? null;
    tracked = item.tracked;
    for (const node of item.inventoryLevels.nodes) {
      const quantities = zero();
      for (const q of node.quantities) if ((NAMES as string[]).includes(q.name)) quantities[q.name as QuantityName] = q.quantity;
      levels.push({ locationId: node.location.id, locationName: node.location.name, quantities });
    }
    const { pageInfo } = item.inventoryLevels;
    after = pageInfo.hasNextPage ? pageInfo.endCursor ?? null : null;
  } while (after);
  return { inventoryItemId, sku, tracked, levels, totals: summarize(levels) };
}

export interface LowStockAlert {
  locationId: string;
  locationName: string;
  available: number;
}

export function lowStockLocations(snapshot: InventorySnapshot, threshold: number): LowStockAlert[] {
  return snapshot.levels
    .filter((level) => level.quantities.available <= threshold)
    .map((level) => ({ locationId: level.locationId, locationName: level.locationName, available: level.quantities.available }));
}

/** Last quantity we saw per location, e.g. folded from inventory_levels/update webhooks. */
export interface ObservedLevel {
  inventoryItemId: string;
  locationId: string;
  available: number;
  observedAt: string;
}

export interface Drift {
  inventoryItemId: string;
  locationId: string;
  shopify: number;
  observed: number;
  delta: number;
}

/**
 * Reconciliation: compare Shopify's live `available` with the last value seen
 * on the webhook stream. Drift means a missed/out-of-order webhook (or a
 * downstream system diverging) and is what the scheduled job reports.
 */
export function findDrift(snapshot: InventorySnapshot, observed: ObservedLevel[]): Drift[] {
  const live = new Map(snapshot.levels.map((l) => [l.locationId, l.quantities.available]));
  return observed
    .filter((o) => o.inventoryItemId === snapshot.inventoryItemId && live.has(o.locationId))
    .map((o) => {
      const shopify = live.get(o.locationId) as number;
      return { inventoryItemId: o.inventoryItemId, locationId: o.locationId, shopify, observed: o.available, delta: shopify - o.available };
    })
    .filter((d) => d.delta !== 0);
}

/**
 * Write `available` back with compare-and-swap. changeFromQuantity is the value
 * we believe Shopify holds; if someone changed it in between, Shopify answers
 * CHANGE_FROM_QUANTITY_STALE instead of clobbering. The idempotency key makes a
 * retried request (e.g. after a timeout) safe to resend.
 */
export async function setAvailableWithCas(
  client: AdminClient,
  args: { inventoryItemId: string; locationId: string; quantity: number; expected: number; reason?: string; idempotencyKey: string },
) {
  const data = await execute<InventorySetQuantitiesMutation, InventorySetQuantitiesMutationVariables>(client, INVENTORY_SET_QUANTITIES, {
    idempotencyKey: args.idempotencyKey,
    input: {
      name: 'available',
      reason: args.reason ?? 'correction',
      quantities: [
        {
          inventoryItemId: args.inventoryItemId,
          locationId: args.locationId,
          quantity: args.quantity,
          changeFromQuantity: args.expected,
        },
      ],
    },
  });
  const payload = data.inventorySetQuantities;
  if (!payload || payload.userErrors.length) throw new UserErrorsError('inventorySetQuantities', payload?.userErrors ?? []);
  return payload.inventoryAdjustmentGroup?.id ?? null;
}
