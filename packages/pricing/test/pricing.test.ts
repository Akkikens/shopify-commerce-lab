import { describe, expect, it } from 'vitest';
import { chunk, diffFixedPrices, planMarketPrice, planMarketPrices, type MarketPricingRule } from '../src/pricing';

const usd = (amount: string) => ({ amount, currencyCode: 'USD' });
const cad = (amount: string) => ({ amount, currencyCode: 'CAD' });

const CANADA: MarketPricingRule = { currency: 'CAD', exchangeRate: '1.3712' };

describe('planMarketPrice', () => {
  it('converts price and compare-at, rounding both to .99', () => {
    expect(planMarketPrice({ variantId: 'v1', price: usd('49.99'), compareAtPrice: usd('64.99') }, CANADA)).toEqual({
      variantId: 'v1',
      price: cad('68.99'),
      compareAtPrice: cad('89.99'),
    });
  });

  it('drops a compare-at price that is not above the source price', () => {
    expect(planMarketPrice({ variantId: 'v1', price: usd('50.00'), compareAtPrice: usd('50.00') }, CANADA)).toMatchObject({
      compareAtPrice: null,
      compareAtDropped: 'source-not-above-price',
    });
  });

  it('drops a compare-at price that rounding collapses onto the price', () => {
    // 50.00 -> 68.56 -> 68.99 ; 50.10 -> 68.70 -> 68.99: no visible saving, so no badge.
    expect(planMarketPrice({ variantId: 'v1', price: usd('50.00'), compareAtPrice: usd('50.10') }, CANADA)).toMatchObject({
      price: cad('68.99'),
      compareAtPrice: null,
      compareAtDropped: 'not-above-price',
    });
  });

  it('applies a market adjustment before rounding', () => {
    const rule: MarketPricingRule = { currency: 'EUR', exchangeRate: '0.92', adjustmentPercent: 8, rounding: { kind: 'ending', ending: '0.95' } };
    // 100 USD -> 92.00 EUR -> +8% = 99.36 -> 99.95
    expect(planMarketPrice({ variantId: 'v1', price: usd('100.00') }, rule).price).toEqual({ amount: '99.95', currencyCode: 'EUR' });
  });

  it('honours per-variant overrides in market currency', () => {
    const rule: MarketPricingRule = { ...CANADA, overrides: { v2: { price: '199.00', compareAtPrice: '149.00' } } };
    const [a, b] = planMarketPrices([{ variantId: 'v1', price: usd('10.00') }, { variantId: 'v2', price: usd('130.00') }], rule);
    expect(a?.price).toEqual(cad('13.99'));
    expect(b).toMatchObject({ price: cad('199.00'), compareAtPrice: null, compareAtDropped: 'not-above-price' });
  });
});

describe('diffFixedPrices', () => {
  it('only upserts changes and deletes variants that left the set', () => {
    const existing = [
      { variantId: 'a', price: cad('10.99'), compareAtPrice: null },
      { variantId: 'b', price: cad('20.99'), compareAtPrice: cad('25.99') },
      { variantId: 'c', price: cad('30.99'), compareAtPrice: null },
    ];
    const desired = [
      { variantId: 'a', price: cad('10.990'), compareAtPrice: null },
      { variantId: 'b', price: cad('20.99'), compareAtPrice: null },
      { variantId: 'd', price: cad('40.99') },
    ];
    expect(diffFixedPrices(existing, desired)).toEqual({
      toUpsert: [
        { variantId: 'b', price: cad('20.99'), compareAtPrice: null },
        { variantId: 'd', price: cad('40.99'), compareAtPrice: null },
      ],
      toDelete: ['c'],
      unchanged: 1,
    });
  });

  it('chunks batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunk([1], 0)).toThrow();
  });
});
