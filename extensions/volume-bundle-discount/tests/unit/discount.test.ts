import { describe, expect, it } from 'vitest';
import { parseConfig, selectTier, DEFAULT_CONFIG } from '../../src/config';
import { fromCents, toCents } from '../../src/money';
import { cartLinesDiscountsGenerateRun, countCompleteBundles } from '../../src/cart_lines_discounts_generate_run';
import { DiscountClass, type CartInput } from '../../generated/api';

const TAGS = ['bundle:keyboard', 'bundle:mouse', 'bundle:headset'];

function line(id: number, quantity: number, tags: string[] = [], isGiftCard = false) {
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    cost: { subtotalAmount: { amount: '10.0' } },
    merchandise: {
      __typename: 'ProductVariant' as const,
      id: `gid://shopify/ProductVariant/${id}`,
      product: {
        id: `gid://shopify/Product/${id}`,
        isGiftCard,
        hasTags: TAGS.map((tag) => ({ tag, hasTag: tags.includes(tag) })),
      },
    },
  };
}

function input(lines: ReturnType<typeof line>[], config: unknown, classes = [DiscountClass.Product, DiscountClass.Order]): CartInput {
  return {
    cart: { lines },
    discount: { discountClasses: classes, metafield: config === undefined ? null : { jsonValue: config } },
  } as CartInput;
}

describe('money', () => {
  it('round-trips decimals through integer cents without float drift', () => {
    expect(fromCents(toCents('0.1') + toCents('0.2'))).toBe('0.30');
    expect(fromCents(toCents('19.99') * 3)).toBe('59.97');
  });
  it('rejects garbage', () => {
    expect(() => toCents('abc')).toThrow();
  });
});

describe('parseConfig', () => {
  it('falls back to defaults for a missing metafield', () => {
    const config = parseConfig(undefined);
    expect(config.bundle).toBeNull();
    expect(config.volumeTiers.map((t) => t.minQuantity)).toEqual([10, 5, 3]);
  });

  it('drops invalid tiers and sorts highest threshold first', () => {
    const config = parseConfig({
      volumeTiers: [
        { minQuantity: 2, percentage: 5 },
        { minQuantity: 0, percentage: 50 },
        { minQuantity: 6, percentage: 150 },
        { minQuantity: 8, percentage: 12 },
      ],
    });
    expect(config.volumeTiers).toEqual([
      { minQuantity: 8, percentage: 12 },
      { minQuantity: 2, percentage: 5 },
    ]);
  });

  it('disables the bundle unless at least two tags and a positive amount are configured', () => {
    expect(parseConfig({ bundleTags: ['a'], bundle: { amountOff: '10' } }).bundle).toBeNull();
    expect(parseConfig({ bundleTags: ['a', 'b'], bundle: { amountOff: '-1' } }).bundle).toBeNull();
    expect(parseConfig({ bundleTags: ['a', 'b', 'a'], bundle: { amountOff: '7.5' } })).toMatchObject({
      bundleTags: ['a', 'b'],
      bundle: { amountOff: '7.50', maxBundles: 1, message: 'Bundle discount' },
    });
  });

  it('selects the best tier the unit count qualifies for', () => {
    expect(selectTier(DEFAULT_CONFIG.volumeTiers.slice().sort((a, b) => b.minQuantity - a.minQuantity), 7)).toEqual({
      minQuantity: 5,
      percentage: 10,
    });
    expect(selectTier(parseConfig(undefined).volumeTiers, 2)).toBeNull();
  });
});

describe('countCompleteBundles', () => {
  it('is limited by the scarcest slot', () => {
    const lines = [
      { id: '1', quantity: 3, bundleTags: ['k'] },
      { id: '2', quantity: 1, bundleTags: ['m'] },
      { id: '3', quantity: 2, bundleTags: ['h'] },
    ];
    expect(countCompleteBundles(lines, ['k', 'm', 'h'])).toBe(1);
    expect(countCompleteBundles(lines, [])).toBe(0);
  });
});

describe('cartLinesDiscountsGenerateRun', () => {
  const config = { bundleTags: TAGS, bundle: { amountOff: '25', maxBundles: 3, message: 'Setup bundle' } };

  it('only emits operations for the discount classes the discount was created with', () => {
    const cart = [line(1, 2, ['bundle:keyboard']), line(2, 2, ['bundle:mouse']), line(3, 2, ['bundle:headset'])];
    const productOnly = cartLinesDiscountsGenerateRun(input(cart, config, [DiscountClass.Product]));
    expect(productOnly.operations).toHaveLength(1);
    expect(productOnly.operations[0]).toHaveProperty('productDiscountsAdd');

    const orderOnly = cartLinesDiscountsGenerateRun(input(cart, config, [DiscountClass.Order]));
    expect(orderOnly.operations).toEqual([
      {
        orderDiscountsAdd: expect.objectContaining({
          candidates: [expect.objectContaining({ message: 'Setup bundle x2', value: { fixedAmount: { amount: '50.00' } } })],
        }),
      },
    ]);

    expect(cartLinesDiscountsGenerateRun(input(cart, config, [DiscountClass.Shipping])).operations).toEqual([]);
  });

  it('never discounts gift cards or counts them toward a tier', () => {
    const result = cartLinesDiscountsGenerateRun(input([line(1, 2), line(2, 20, [], true)], config));
    expect(result.operations).toEqual([]);
  });
});
