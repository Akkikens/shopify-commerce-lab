import { divCeil, fromMinor, minorUnitDigits, parseScaled, toMinor, type Money } from './money';

/**
 * Price-rounding policies for converted fixed prices. Shopify only auto-rounds
 * prices it converts itself (Markets "rounding" setting); fixed prices on a price
 * list are stored exactly as sent, so an app that writes them owns the rounding.
 *
 * - `exact`: keep the converted amount (already half-up to minor units).
 * - `increment`: round UP to a multiple, e.g. 0.05 (CHF cash), 10 or 100 (JPY).
 * - `ending`: round UP to the next price with this fractional ending, e.g. 0.99
 *   turns 41.20 into 41.99 and keeps 41.99 as is.
 */
export type RoundingRule =
  | { kind: 'exact' }
  | { kind: 'increment'; increment: string }
  | { kind: 'ending'; ending: string };

/** Example house policy: charm pricing for decimal currencies, round hundreds for zero-decimal ones. */
export function defaultRoundingFor(currencyCode: string): RoundingRule {
  return minorUnitDigits(currencyCode) === 0
    ? { kind: 'increment', increment: '100' }
    : { kind: 'ending', ending: '0.99' };
}

export function roundPrice(money: Money, rule: RoundingRule): Money {
  const digits = minorUnitDigits(money.currencyCode);
  const minor = toMinor(money);
  if (rule.kind === 'exact' || minor <= 0n) return money;

  if (rule.kind === 'increment') {
    const step = parseScaled(rule.increment, digits);
    if (step <= 0n) throw new Error(`Rounding increment must be positive, got ${rule.increment}`);
    return fromMinor(divCeil(minor, step) * step, money.currencyCode);
  }

  const one = 10n ** BigInt(digits);
  const ending = parseScaled(rule.ending, digits);
  if (ending < 0n || ending >= one) {
    throw new Error(`Ending must be a fraction of one ${money.currencyCode} unit, got ${rule.ending}`);
  }
  // Smallest k*one + ending that is >= minor.
  const k = divCeil(minor - ending, one);
  return fromMinor((k < 0n ? 0n : k) * one + ending, money.currencyCode);
}
