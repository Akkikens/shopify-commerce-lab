import { describe, expect, it } from 'vitest';
import { createMarketPriceList, listMarketPriceLists, syncFixedPrices } from '../src/catalogs';
import { UserErrorsError, AdminApiError } from '../src/client';
import { mockAdminClient } from './mock-client';

const cad = (amount: string) => ({ amount, currencyCode: 'CAD' });

function market(id: string, priceList: Record<string, unknown> | null) {
  return {
    id,
    name: `Market ${id}`,
    handle: id,
    status: 'ACTIVE',
    currencySettings: { baseCurrency: { currencyCode: 'CAD' }, localCurrencies: false, roundingEnabled: true },
    catalogs: { nodes: [{ id: `cat-${id}`, title: 't', status: 'ACTIVE', priceList }] },
  };
}

describe('listMarketPriceLists', () => {
  it('paginates markets and flattens catalog price lists', async () => {
    const { client, calls } = mockAdminClient({
      MarketsWithPriceLists: (_vars, i) => ({
        data: {
          markets:
            i === 0
              ? {
                  nodes: [market('ca', { id: 'pl1', name: 'Canada', currency: 'CAD', fixedPricesCount: 3, parent: { adjustment: { type: 'PERCENTAGE_INCREASE', value: 5 } } })],
                  pageInfo: { hasNextPage: true, endCursor: 'c1' },
                }
              : { nodes: [market('mx', null)], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      }),
    });
    const result = await listMarketPriceLists(client, 1);
    expect(calls.map((c) => c.variables.after)).toEqual([null, 'c1']);
    expect(result).toHaveLength(2);
    expect(result[0]?.priceLists).toEqual([{ id: 'pl1', name: 'Canada', currency: 'CAD', fixedPricesCount: 3, adjustment: 'PERCENTAGE_INCREASE 5%' }]);
    expect(result[1]?.priceLists).toEqual([]);
  });
});

describe('createMarketPriceList', () => {
  it('creates the price list, then a catalog scoped to the market', async () => {
    const { client, calls } = mockAdminClient({
      PriceListCreate: () => ({ data: { priceListCreate: { priceList: { id: 'pl9', name: 'CA', currency: 'CAD' }, userErrors: [] } } }),
      CatalogCreate: () => ({ data: { catalogCreate: { catalog: { id: 'cat9', title: 'CA catalog', status: 'ACTIVE' }, userErrors: [] } } }),
    });
    await expect(createMarketPriceList(client, { marketId: 'm1', name: 'CA', currency: 'CAD' })).resolves.toEqual({ priceListId: 'pl9', catalogId: 'cat9' });
    expect(calls[1]).toEqual({
      operation: 'CatalogCreate',
      variables: { input: { title: 'CA catalog', status: 'ACTIVE', context: { marketIds: ['m1'] }, priceListId: 'pl9' } },
    });
  });

  it('raises userErrors instead of continuing', async () => {
    const { client, calls } = mockAdminClient({
      PriceListCreate: () => ({ data: { priceListCreate: { priceList: null, userErrors: [{ field: ['input', 'name'], code: 'TAKEN', message: 'Name has already been taken' }] } } }),
    });
    await expect(createMarketPriceList(client, { marketId: 'm1', name: 'CA', currency: 'CAD' })).rejects.toBeInstanceOf(UserErrorsError);
    expect(calls).toHaveLength(1);
  });
});

describe('syncFixedPrices', () => {
  const existing = [
    { variant: { id: 'a' }, price: cad('10.99'), compareAtPrice: null },
    { variant: { id: 'b' }, price: cad('20.99'), compareAtPrice: null },
  ];
  const fixedPrices = () => ({ data: { priceList: { id: 'pl1', currency: 'CAD', prices: { nodes: existing, pageInfo: { hasNextPage: false, endCursor: null } } } } });

  it('sends only the diff, in batches', async () => {
    const { client, calls } = mockAdminClient({
      PriceListFixedPrices: fixedPrices,
      PriceListFixedPricesUpdate: () => ({ data: { priceListFixedPricesUpdate: { pricesAdded: [], deletedFixedPriceVariantIds: [], userErrors: [] } } }),
    });
    const desired = [
      { variantId: 'a', price: cad('10.99'), compareAtPrice: null },
      { variantId: 'c', price: cad('30.99'), compareAtPrice: cad('39.99') },
      { variantId: 'd', price: cad('40.99'), compareAtPrice: null },
    ];
    const result = await syncFixedPrices(client, 'pl1', desired, { batchSize: 1 });
    expect(result).toEqual({ upserted: 2, deleted: 1, unchanged: 1, batches: 2 });
    const updates = calls.filter((c) => c.operation === 'PriceListFixedPricesUpdate').map((c) => c.variables);
    expect(updates).toEqual([
      { priceListId: 'pl1', pricesToAdd: [{ variantId: 'c', price: cad('30.99'), compareAtPrice: cad('39.99') }], variantIdsToDelete: ['b'] },
      { priceListId: 'pl1', pricesToAdd: [{ variantId: 'd', price: cad('40.99'), compareAtPrice: null }], variantIdsToDelete: [] },
    ]);
  });

  it('is a no-op when the price list already matches', async () => {
    const { client, calls } = mockAdminClient({ PriceListFixedPrices: fixedPrices });
    const desired = existing.map((p) => ({ variantId: p.variant.id, price: p.price, compareAtPrice: null }));
    await expect(syncFixedPrices(client, 'pl1', desired)).resolves.toMatchObject({ upserted: 0, deleted: 0, batches: 0 });
    expect(calls.map((c) => c.operation)).toEqual(['PriceListFixedPrices']);
  });

  it('surfaces currency mismatch userErrors', async () => {
    const { client } = mockAdminClient({
      PriceListFixedPrices: fixedPrices,
      PriceListFixedPricesUpdate: () => ({
        data: { priceListFixedPricesUpdate: { pricesAdded: null, deletedFixedPriceVariantIds: null, userErrors: [{ field: ['pricesToAdd', '0', 'price'], code: 'PRICE_LIST_CURRENCY_MISMATCH', message: 'Currency mismatch' }] } },
      }),
    });
    const error = await syncFixedPrices(client, 'pl1', [{ variantId: 'x', price: { amount: '1.00', currencyCode: 'USD' } }]).catch((e) => e);
    expect(error).toBeInstanceOf(UserErrorsError);
    expect(error.userErrors[0].code).toBe('PRICE_LIST_CURRENCY_MISMATCH');
  });

  it('treats top-level GraphQL errors (e.g. throttling) as failures', async () => {
    const { client } = mockAdminClient({ PriceListFixedPrices: () => ({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] }) });
    await expect(syncFixedPrices(client, 'pl1', [])).rejects.toBeInstanceOf(AdminApiError);
  });
});
