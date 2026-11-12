import { createShopifyRequestContext, createStorefrontClient, getLocalizedHref, matchLocale } from '@shopify/hydrogen';
import { describe, expect, it, vi } from 'vitest';
import { i18n, intlLocale } from './i18n';
import { HOME_QUERY } from './queries.server';

describe('market routing', () => {
  it('resolves path-prefixed markets and falls back to the default', () => {
    expect(matchLocale(new Request('https://shop.test/en-ca/products/k70'), i18n)).toMatchObject({ language: 'EN', country: 'CA', pathPrefix: '/en-ca' });
    expect(matchLocale(new Request('https://shop.test/ja-jp/'), i18n)).toMatchObject({ country: 'JP', pathPrefix: '/ja-jp' });
    expect(matchLocale(new Request('https://shop.test/xx/products/k70'), i18n).pathPrefix).toBe('');
  });

  it('builds market switcher links for the same page', () => {
    expect(getLocalizedHref('/en-ca/products/k70?Color=Black', { i18n, locale: { language: 'DE', country: 'DE' } })).toBe(
      '/de-de/products/k70?Color=Black',
    );
    expect(getLocalizedHref('/de-de/products/k70', { i18n, locale: i18n.defaultLocale })).toBe('/products/k70');
    expect(intlLocale({ language: 'JA', country: 'JP' })).toBe('ja-JP');
  });

  it('sends the resolved market as @inContext variables to the Storefront API', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { localization: { country: { isoCode: 'GB', name: 'UK', currency: { isoCode: 'GBP' } } }, products: { nodes: [] } } }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createStorefrontClient({
      type: 'public',
      requestContext: createShopifyRequestContext({ request: new Request('https://shop.test/en-gb/'), i18n }),
      config: { storeDomain: 'mechanical-keyboards.mock.shop', publicStorefrontToken: undefined, fetch },
    });
    const { data } = await client.graphql(HOME_QUERY);
    expect(data?.localization.country.currency.isoCode).toBe('GBP');
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('mechanical-keyboards.mock.shop');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.variables).toMatchObject({ country: 'GB', language: 'EN' });
    expect(body.query).toContain('@inContext(country: $country, language: $language)');
  });
});
