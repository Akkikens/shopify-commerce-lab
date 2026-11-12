import { compareMoney, convert, type Money } from './money';
import { defaultRoundingFor, roundPrice, type RoundingRule } from './rounding';

export interface BaseVariantPrice {
  variantId: string;
  price: Money;
  compareAtPrice?: Money | null;
}

/** A buyer-facing market price, shaped like the Admin API's PriceListPriceInput. */
export interface PriceListPriceInput {
  variantId: string;
  price: Money;
  compareAtPrice?: Money | null;
}

export interface MarketPricingRule {
  currency: string;
  /** Units of `currency` per 1 unit of the shop currency. */
  exchangeRate: string;
  /** Optional market uplift/discount in percent applied before rounding, e.g. 8 for +8%. */
  adjustmentPercent?: number;
  rounding?: RoundingRule;
  /** Per-variant overrides in the market currency (e.g. MAP-enforced launch prices). */
  overrides?: Record<string, { price: string; compareAtPrice?: string | null }>;
}

export interface PlannedPrice extends PriceListPriceInput {
  /** Set when a compare-at price was dropped and why. */
  compareAtDropped?: 'not-above-price' | 'source-not-above-price';
}

function applyAdjustment(money: Money, percent: number | undefined): Money {
  if (!percent) return money;
  // 1 + percent/100 as an exact decimal rate in the same currency.
  const factor = (1 + percent / 100).toFixed(6);
  return convert(money, money.currencyCode, factor);
}

function toMarket(money: Money, rule: MarketPricingRule): Money {
  const converted = convert(money, rule.currency, rule.exchangeRate);
  const adjusted = applyAdjustment(converted, rule.adjustmentPercent);
  return roundPrice(adjusted, rule.rounding ?? defaultRoundingFor(rule.currency));
}

/**
 * Compute the fixed price (and compare-at price) a variant should carry on a
 * market's price list. Compare-at prices are converted with the same rule and
 * dropped whenever they would not be strictly above the selling price, which
 * would otherwise render a bogus "sale" badge (or none at all).
 */
export function planMarketPrice(base: BaseVariantPrice, rule: MarketPricingRule): PlannedPrice {
  const override = rule.overrides?.[base.variantId];
  if (override) {
    const price = { amount: override.price, currencyCode: rule.currency };
    const compareAt = override.compareAtPrice ? { amount: override.compareAtPrice, currencyCode: rule.currency } : null;
    if (compareAt && compareMoney(compareAt, price) <= 0) {
      return { variantId: base.variantId, price, compareAtPrice: null, compareAtDropped: 'not-above-price' };
    }
    return { variantId: base.variantId, price, compareAtPrice: compareAt };
  }

  const price = toMarket(base.price, rule);
  if (!base.compareAtPrice) return { variantId: base.variantId, price, compareAtPrice: null };

  if (compareMoney(base.compareAtPrice, base.price) <= 0) {
    return { variantId: base.variantId, price, compareAtPrice: null, compareAtDropped: 'source-not-above-price' };
  }
  const compareAtPrice = toMarket(base.compareAtPrice, rule);
  if (compareMoney(compareAtPrice, price) <= 0) {
    return { variantId: base.variantId, price, compareAtPrice: null, compareAtDropped: 'not-above-price' };
  }
  return { variantId: base.variantId, price, compareAtPrice };
}

export function planMarketPrices(base: BaseVariantPrice[], rule: MarketPricingRule): PlannedPrice[] {
  return base.map((variant) => planMarketPrice(variant, rule));
}

export interface FixedPriceDiff {
  toUpsert: PriceListPriceInput[];
  toDelete: string[];
  unchanged: number;
}

const sameMoney = (a?: Money | null, b?: Money | null) =>
  (!a && !b) || (!!a && !!b && a.currencyCode === b.currencyCode && compareMoney(a, b) === 0);

/**
 * Idempotent sync plan: only send variants whose price or compare-at changed,
 * and delete fixed prices for variants no longer in the desired set (they fall
 * back to the price list's percentage adjustment).
 */
export function diffFixedPrices(existing: PriceListPriceInput[], desired: PriceListPriceInput[]): FixedPriceDiff {
  const current = new Map(existing.map((p) => [p.variantId, p]));
  const wanted = new Set(desired.map((p) => p.variantId));
  const toUpsert: PriceListPriceInput[] = [];
  let unchanged = 0;
  for (const next of desired) {
    const prev = current.get(next.variantId);
    if (prev && sameMoney(prev.price, next.price) && sameMoney(prev.compareAtPrice, next.compareAtPrice)) {
      unchanged += 1;
    } else {
      toUpsert.push({ variantId: next.variantId, price: next.price, compareAtPrice: next.compareAtPrice ?? null });
    }
  }
  const toDelete = existing.filter((p) => !wanted.has(p.variantId)).map((p) => p.variantId);
  return { toUpsert, toDelete, unchanged };
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
