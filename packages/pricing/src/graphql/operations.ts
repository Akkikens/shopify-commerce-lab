/**
 * Admin GraphQL documents (API version 2026-10). Every document is validated
 * against schema/admin-2026-10.graphql in test/schema.test.ts and typed by
 * graphql-codegen into src/generated/admin.types.ts.
 */

/** Markets with their catalogs' price lists and currency settings. */
export const MARKETS_WITH_PRICE_LISTS = /* GraphQL */ `
  query MarketsWithPriceLists($first: Int!, $after: String) {
    markets(first: $first, after: $after) {
      nodes {
        id
        name
        handle
        status
        currencySettings {
          baseCurrency {
            currencyCode
          }
          localCurrencies
          roundingEnabled
        }
        catalogs(first: 5) {
          nodes {
            id
            title
            status
            priceList {
              id
              name
              currency
              fixedPricesCount
              parent {
                adjustment {
                  type
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const PRICE_LIST_CREATE = /* GraphQL */ `
  mutation PriceListCreate($input: PriceListCreateInput!) {
    priceListCreate(input: $input) {
      priceList {
        id
        name
        currency
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

/** A catalog scoped to one or more markets, pointing at a price list. */
export const CATALOG_CREATE = /* GraphQL */ `
  mutation CatalogCreate($input: CatalogCreateInput!) {
    catalogCreate(input: $input) {
      catalog {
        id
        title
        status
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

/** Existing fixed prices on a price list (paginated). */
export const PRICE_LIST_FIXED_PRICES = /* GraphQL */ `
  query PriceListFixedPrices($id: ID!, $first: Int!, $after: String) {
    priceList(id: $id) {
      id
      currency
      prices(first: $first, after: $after, originType: FIXED) {
        nodes {
          variant {
            id
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const PRICE_LIST_FIXED_PRICES_ADD = /* GraphQL */ `
  mutation PriceListFixedPricesAdd($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
    priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
      prices {
        variant {
          id
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

/** Add/replace and delete fixed prices in one round trip. */
export const PRICE_LIST_FIXED_PRICES_UPDATE = /* GraphQL */ `
  mutation PriceListFixedPricesUpdate(
    $priceListId: ID!
    $pricesToAdd: [PriceListPriceInput!]!
    $variantIdsToDelete: [ID!]!
  ) {
    priceListFixedPricesUpdate(
      priceListId: $priceListId
      pricesToAdd: $pricesToAdd
      variantIdsToDelete: $variantIdsToDelete
    ) {
      pricesAdded {
        variant {
          id
        }
      }
      deletedFixedPriceVariantIds
      userErrors {
        field
        code
        message
      }
    }
  }
`;

/** What a buyer in a given country actually pays (catalog + price list applied). */
export const VARIANT_CONTEXTUAL_PRICING = /* GraphQL */ `
  query VariantContextualPricing($id: ID!, $country: CountryCode!) {
    productVariant(id: $id) {
      id
      price
      compareAtPrice
      contextualPricing(context: { country: $country }) {
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
      }
    }
  }
`;

/** Inventory levels for one item across every location. */
export const INVENTORY_LEVELS = /* GraphQL */ `
  query InventoryLevels($inventoryItemId: ID!, $first: Int!, $after: String) {
    inventoryItem(id: $inventoryItemId) {
      id
      sku
      tracked
      inventoryLevels(first: $first, after: $after) {
        nodes {
          id
          location {
            id
            name
          }
          quantities(names: ["available", "on_hand", "committed", "incoming"]) {
            name
            quantity
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/**
 * Compare-and-swap correction. Since 2026-04 every quantity needs an explicit
 * changeFromQuantity and the mutation needs an @idempotent key.
 */
export const INVENTORY_SET_QUANTITIES = /* GraphQL */ `
  mutation InventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        id
        reason
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;
