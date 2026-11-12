import { describe, expect, it } from 'vitest';
import { findDrift, getInventorySnapshot, lowStockLocations, setAvailableWithCas } from '../src/inventory';
import { UserErrorsError } from '../src/client';
import { mockAdminClient } from './mock-client';

const level = (loc: string, available: number, onHand: number) => ({
  id: `lvl-${loc}`,
  location: { id: `gid://shopify/Location/${loc}`, name: `Warehouse ${loc}` },
  quantities: [
    { name: 'available', quantity: available },
    { name: 'on_hand', quantity: onHand },
    { name: 'committed', quantity: onHand - available },
    { name: 'incoming', quantity: 0 },
  ],
});

function client() {
  return mockAdminClient({
    InventoryLevels: (_v, i) => ({
      data: {
        inventoryItem: {
          id: 'item1',
          sku: 'K70-RGB',
          tracked: true,
          inventoryLevels:
            i === 0
              ? { nodes: [level('1', 12, 15)], pageInfo: { hasNextPage: true, endCursor: 'x' } }
              : { nodes: [level('2', 2, 2)], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    }),
  });
}

describe('inventory across locations', () => {
  it('aggregates every location (paginated)', async () => {
    const { client: c } = client();
    const snapshot = await getInventorySnapshot(c, 'item1', 1);
    expect(snapshot.levels).toHaveLength(2);
    expect(snapshot.totals).toEqual({ available: 14, on_hand: 17, committed: 3, incoming: 0 });
    expect(lowStockLocations(snapshot, 5)).toEqual([{ locationId: 'gid://shopify/Location/2', locationName: 'Warehouse 2', available: 2 }]);
  });

  it('reports drift between Shopify and the webhook stream', async () => {
    const { client: c } = client();
    const snapshot = await getInventorySnapshot(c, 'item1', 1);
    const drift = findDrift(snapshot, [
      { inventoryItemId: 'item1', locationId: 'gid://shopify/Location/1', available: 12, observedAt: 't' },
      { inventoryItemId: 'item1', locationId: 'gid://shopify/Location/2', available: 5, observedAt: 't' },
      { inventoryItemId: 'other', locationId: 'gid://shopify/Location/2', available: 99, observedAt: 't' },
    ]);
    expect(drift).toEqual([{ inventoryItemId: 'item1', locationId: 'gid://shopify/Location/2', shopify: 2, observed: 5, delta: -3 }]);
  });
});

describe('setAvailableWithCas', () => {
  it('sends changeFromQuantity and an idempotency key', async () => {
    const { client: c, calls } = mockAdminClient({
      InventorySetQuantities: () => ({ data: { inventorySetQuantities: { inventoryAdjustmentGroup: { id: 'adj1', reason: 'correction' }, userErrors: [] } } }),
    });
    await expect(
      setAvailableWithCas(c, { inventoryItemId: 'item1', locationId: 'loc1', quantity: 10, expected: 12, idempotencyKey: 'recon-2026-11-12-item1-loc1' }),
    ).resolves.toBe('adj1');
    expect(calls[0]?.variables).toEqual({
      idempotencyKey: 'recon-2026-11-12-item1-loc1',
      input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId: 'item1', locationId: 'loc1', quantity: 10, changeFromQuantity: 12 }] },
    });
  });

  it('surfaces a stale compare-and-swap', async () => {
    const { client: c } = mockAdminClient({
      InventorySetQuantities: () => ({
        data: { inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [{ field: ['input'], code: 'CHANGE_FROM_QUANTITY_STALE', message: 'stale' }] } },
      }),
    });
    await expect(
      setAvailableWithCas(c, { inventoryItemId: 'i', locationId: 'l', quantity: 1, expected: 2, idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(UserErrorsError);
  });
});
