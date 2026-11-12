import { execute, UserErrorsError, type AdminClient } from './client';
import type {
  CatalogCreateMutation,
  CatalogCreateMutationVariables,
  CurrencyCode,
  MarketsWithPriceListsQuery,
  MarketsWithPriceListsQueryVariables,
  PriceListCreateMutation,
  PriceListCreateMutationVariables,
  PriceListFixedPricesQuery,
  PriceListFixedPricesQueryVariables,
  PriceListFixedPricesUpdateMutation,
  PriceListFixedPricesUpdateMutationVariables,
  VariantContextualPricingQuery,
  VariantContextualPricingQueryVariables,
  CountryCode,
} from './generated/admin.types';
import {
  CATALOG_CREATE,
  MARKETS_WITH_PRICE_LISTS,
  PRICE_LIST_CREATE,
  PRICE_LIST_FIXED_PRICES,
  PRICE_LIST_FIXED_PRICES_UPDATE,
  VARIANT_CONTEXTUAL_PRICING,
} from './graphql/operations';
import { chunk, diffFixedPrices, type PriceListPriceInput } from './pricing';

export interface MarketPriceListSummary {
  marketId: string;
  marketName: string;
  marketHandle: string;
  baseCurrency: string | null;
  roundingEnabled: boolean;
  priceLists: Array<{ id: string; name: string; currency: string; fixedPricesCount: number; adjustment: string | null }>;
}

/** Walk every market (cursor pagination) and flatten catalogs to their price lists. */
export async function listMarketPriceLists(client: AdminClient, pageSize = 50): Promise<MarketPriceListSummary[]> {
  const out: MarketPriceListSummary[] = [];
  let after: string | null = null;
  do {
    const data: MarketsWithPriceListsQuery = await execute<MarketsWithPriceListsQuery, MarketsWithPriceListsQueryVariables>(
      client,
      MARKETS_WITH_PRICE_LISTS,
      { first: pageSize, after },
    );
    for (const market of data.markets.nodes) {
      out.push({
        marketId: market.id,
        marketName: market.name,
        marketHandle: market.handle,
        baseCurrency: market.currencySettings?.baseCurrency.currencyCode ?? null,
        roundingEnabled: market.currencySettings?.roundingEnabled ?? false,
        priceLists: market.catalogs.nodes.flatMap((catalog) =>
          catalog.priceList
            ? [
                {
                  id: catalog.priceList.id,
                  name: catalog.priceList.name,
                  currency: catalog.priceList.currency,
                  fixedPricesCount: catalog.priceList.fixedPricesCount,
                  adjustment: catalog.priceList.parent?.adjustment
                    ? `${catalog.priceList.parent.adjustment.type} ${catalog.priceList.parent.adjustment.value}%`
                    : null,
                },
              ]
            : [],
        ),
      });
    }
    after = data.markets.pageInfo.hasNextPage ? data.markets.pageInfo.endCursor ?? null : null;
  } while (after);
  return out;
}

export interface CreateMarketPriceListInput {
  marketId: string;
  name: string;
  currency: CurrencyCode;
  /** Percentage adjustment relative to shop prices for variants without a fixed price. */
  adjustment?: { type: 'PERCENTAGE_DECREASE' | 'PERCENTAGE_INCREASE'; value: number };
}

/**
 * Markets + Catalogs setup: create a price list, then a market catalog bound to
 * it. Returns both ids. userErrors from either step are raised, not swallowed.
 */
export async function createMarketPriceList(client: AdminClient, input: CreateMarketPriceListInput) {
  const priceListData = await execute<PriceListCreateMutation, PriceListCreateMutationVariables>(client, PRICE_LIST_CREATE, {
    input: {
      name: input.name,
      currency: input.currency,
      parent: { adjustment: input.adjustment ?? { type: 'PERCENTAGE_DECREASE', value: 0 } },
    },
  });
  const created = priceListData.priceListCreate;
  if (!created || created.userErrors.length) throw new UserErrorsError('priceListCreate', created?.userErrors ?? []);
  if (!created.priceList) throw new UserErrorsError('priceListCreate', [{ message: 'No price list returned' }]);

  const catalogData = await execute<CatalogCreateMutation, CatalogCreateMutationVariables>(client, CATALOG_CREATE, {
    input: {
      title: `${input.name} catalog`,
      status: 'ACTIVE',
      context: { marketIds: [input.marketId] },
      priceListId: created.priceList.id,
    },
  });
  const catalog = catalogData.catalogCreate;
  if (!catalog || catalog.userErrors.length) throw new UserErrorsError('catalogCreate', catalog?.userErrors ?? []);
  return { priceListId: created.priceList.id, catalogId: catalog.catalog?.id ?? null };
}

/** All FIXED-origin prices currently on a price list. */
export async function fetchFixedPrices(client: AdminClient, priceListId: string, pageSize = 250): Promise<PriceListPriceInput[]> {
  const prices: PriceListPriceInput[] = [];
  let after: string | null = null;
  do {
    const data: PriceListFixedPricesQuery = await execute<PriceListFixedPricesQuery, PriceListFixedPricesQueryVariables>(
      client,
      PRICE_LIST_FIXED_PRICES,
      { id: priceListId, first: pageSize, after },
    );
    if (!data.priceList) throw new UserErrorsError('priceList', [{ code: 'PRICE_LIST_NOT_FOUND', message: `Price list ${priceListId} not found` }]);
    for (const node of data.priceList.prices.nodes) {
      prices.push({ variantId: node.variant.id, price: node.price, compareAtPrice: node.compareAtPrice ?? null });
    }
    const { pageInfo } = data.priceList.prices;
    after = pageInfo.hasNextPage ? pageInfo.endCursor ?? null : null;
  } while (after);
  return prices;
}

export interface SyncResult {
  upserted: number;
  deleted: number;
  unchanged: number;
  batches: number;
}

/**
 * Idempotently converge a price list's fixed prices on `desired`: diff against
 * what's there, then send only changes through priceListFixedPricesUpdate in
 * chunks. Re-running with the same input is a no-op (zero mutations).
 */
export async function syncFixedPrices(
  client: AdminClient,
  priceListId: string,
  desired: PriceListPriceInput[],
  { batchSize = 100 }: { batchSize?: number } = {},
): Promise<SyncResult> {
  const existing = await fetchFixedPrices(client, priceListId);
  const diff = diffFixedPrices(existing, desired);
  const upsertBatches = chunk(diff.toUpsert, batchSize);
  const deleteBatches = chunk(diff.toDelete, batchSize);
  const batches = Math.max(upsertBatches.length, deleteBatches.length);

  for (let i = 0; i < batches; i += 1) {
    const data = await execute<PriceListFixedPricesUpdateMutation, PriceListFixedPricesUpdateMutationVariables>(
      client,
      PRICE_LIST_FIXED_PRICES_UPDATE,
      {
        priceListId,
        pricesToAdd: (upsertBatches[i] ?? []).map((p) => ({
          variantId: p.variantId,
          price: { amount: p.price.amount, currencyCode: p.price.currencyCode as CurrencyCode },
          compareAtPrice: p.compareAtPrice
            ? { amount: p.compareAtPrice.amount, currencyCode: p.compareAtPrice.currencyCode as CurrencyCode }
            : null,
        })),
        variantIdsToDelete: deleteBatches[i] ?? [],
      },
    );
    const payload = data.priceListFixedPricesUpdate;
    if (!payload || payload.userErrors.length) {
      throw new UserErrorsError('priceListFixedPricesUpdate', payload?.userErrors ?? []);
    }
  }
  return { upserted: diff.toUpsert.length, deleted: diff.toDelete.length, unchanged: diff.unchanged, batches };
}

/** Read back what a buyer in `country` pays, to verify a sync end to end. */
export async function getContextualPrice(client: AdminClient, variantId: string, country: CountryCode) {
  const data = await execute<VariantContextualPricingQuery, VariantContextualPricingQueryVariables>(
    client,
    VARIANT_CONTEXTUAL_PRICING,
    { id: variantId, country },
  );
  return data.productVariant?.contextualPricing ?? null;
}
