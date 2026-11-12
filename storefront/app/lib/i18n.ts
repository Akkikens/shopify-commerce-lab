import { defineShopifyI18n } from '@shopify/hydrogen';

/**
 * Markets as path prefixes: `/` is US, `/en-ca/...` Canada, etc. The request
 * context resolves the locale from the URL and Hydrogen injects $country /
 * $language into every query that declares them with @inContext, so Shopify
 * returns that market's prices and currency.
 */
export const i18n = defineShopifyI18n({
  defaultLocale: { language: 'EN', country: 'US', label: 'United States (USD)' },
  routing: {
    type: 'pathname',
    locales: [
      { language: 'EN', country: 'CA', label: 'Canada (CAD)' },
      { language: 'EN', country: 'GB', label: 'United Kingdom (GBP)' },
      { language: 'DE', country: 'DE', label: 'Deutschland (EUR)' },
      { language: 'JA', country: 'JP', label: '日本 (JPY)' },
    ],
  },
});

/** BCP 47 tag for Intl formatting, e.g. EN + CA -> en-CA. */
export function intlLocale(locale: { language: string; country: string }): string {
  return `${locale.language.replace(/_.*$/, '').toLowerCase()}-${locale.country}`;
}
