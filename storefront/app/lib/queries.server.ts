import { gql, type StorefrontApi } from '@shopify/hydrogen';

const MONEY = gql(`
  fragment Money on MoneyV2 {
    amount
    currencyCode
  }
`);

export const HOME_QUERY = gql(
  `
  query Home($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    localization {
      country {
        isoCode
        name
        currency {
          isoCode
        }
      }
    }
    products(first: 12, sortKey: BEST_SELLING) {
      nodes {
        id
        handle
        title
        productType
        featuredImage {
          url(transform: { maxWidth: 600 })
          altText
        }
        priceRange {
          minVariantPrice {
            ...Money
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            ...Money
          }
        }
      }
    }
  }
`,
  [MONEY],
);

export const PRODUCT_QUERY = gql(
  `
  query Product(
    $handle: String!
    $selectedOptions: [SelectedOptionInput!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    localization {
      country {
        isoCode
        name
        currency {
          isoCode
        }
      }
    }
    product(handle: $handle) {
      id
      handle
      title
      vendor
      productType
      descriptionHtml
      featuredImage {
        url(transform: { maxWidth: 1000 })
        altText
      }
      options {
        name
        optionValues {
          name
        }
      }
      selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
        id
        title
        sku
        availableForSale
        selectedOptions {
          name
          value
        }
        price {
          ...Money
        }
        compareAtPrice {
          ...Money
        }
      }
      specs: metafields(
        identifiers: [
          { namespace: "specs", key: "layout" }
          { namespace: "specs", key: "switch_type" }
          { namespace: "specs", key: "connectivity" }
          { namespace: "specs", key: "polling_rate_hz" }
          { namespace: "specs", key: "weight" }
          { namespace: "specs", key: "dimensions" }
          { namespace: "specs", key: "hot_swappable" }
          { namespace: "specs", key: "warranty_years" }
        ]
      ) {
        namespace
        key
        type
        value
      }
    }
  }
`,
  [MONEY],
);

export type HomeData = StorefrontApi.ResultOf<typeof HOME_QUERY>;
export type ProductData = StorefrontApi.ResultOf<typeof PRODUCT_QUERY>;
