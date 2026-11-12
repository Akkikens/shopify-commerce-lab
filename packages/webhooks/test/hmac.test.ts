import { describe, expect, it } from 'vitest';
import { computeHmac, verifyShopifyHmac } from '../src/hmac';
import { parseWebhookHeaders, MissingHeaderError } from '../src/headers';
import { SECRET, fixture, signedRequest } from './helpers';

describe('verifyShopifyHmac', () => {
  const body = fixture('orders-create.json');
  const signature = computeHmac(body, SECRET);

  it('accepts the exact raw body signed with the app secret', () => {
    expect(verifyShopifyHmac(Buffer.from(body), signature, [SECRET])).toBe(true);
  });

  it('rejects a body that was re-serialised or tampered with', () => {
    expect(verifyShopifyHmac(JSON.stringify(JSON.parse(body)), signature, [SECRET])).toBe(false);
    expect(verifyShopifyHmac(body.replace('259.97', '0.01'), signature, [SECRET])).toBe(false);
  });

  it('rejects the wrong secret, missing or malformed signatures', () => {
    expect(verifyShopifyHmac(body, signature, ['other-secret'])).toBe(false);
    expect(verifyShopifyHmac(body, undefined, [SECRET])).toBe(false);
    expect(verifyShopifyHmac(body, 'not-base64!!', [SECRET])).toBe(false);
    expect(verifyShopifyHmac(body, signature, [''])).toBe(false);
  });

  it('accepts either secret during a rotation window', () => {
    expect(verifyShopifyHmac(body, computeHmac(body, 'old-secret'), [SECRET, 'old-secret'])).toBe(true);
  });
});

describe('parseWebhookHeaders', () => {
  it('reads headers case-insensitively', () => {
    const { headers } = signedRequest('{}');
    const upper = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.replace(/(^|-)\w/g, (s) => s.toUpperCase()), v]));
    expect(parseWebhookHeaders(upper)).toMatchObject({ topic: 'orders/create', shopDomain: 'lab-dev.myshopify.com', apiVersion: '2026-10' });
  });

  it('requires topic, shop and webhook id', () => {
    const { headers } = signedRequest('{}');
    delete (headers as Record<string, string>)['x-shopify-webhook-id'];
    expect(() => parseWebhookHeaders(headers)).toThrow(MissingHeaderError);
  });
});

describe('parseShopifyJson', () => {
  it('keeps 64-bit ids exact and leaves safe numbers alone', async () => {
    const { parseShopifyJson } = await import('../src/json');
    expect(JSON.parse('{"id":271878346596884015}').id).toBe(271878346596884000);
    expect(parseShopifyJson('{"id":271878346596884015,"qty":7,"price":"9.99","ratio":1.5}')).toEqual({
      id: '271878346596884015',
      qty: 7,
      price: '9.99',
      ratio: 1.5,
    });
  });
});
