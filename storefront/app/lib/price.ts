export interface Money {
  amount: string;
  currencyCode: string;
}

/** Integer minor units from a decimal string, without float arithmetic. */
function toMinor(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.');
  return BigInt(`${whole}${frac.padEnd(4, '0').slice(0, 4)}`);
}

/**
 * The compare-at price is only shown when it's strictly above the price in the
 * same currency (the API can return equal or stale compare-at values). The
 * saving is a whole percentage, rounded down so we never overstate it.
 */
export function getSaving(price: Money, compareAtPrice: Money | null | undefined): { compareAtPrice: Money; percentOff: number } | null {
  if (!compareAtPrice || compareAtPrice.currencyCode !== price.currencyCode) return null;
  const p = toMinor(price.amount);
  const c = toMinor(compareAtPrice.amount);
  if (c <= p || c === 0n) return null;
  return { compareAtPrice, percentOff: Number(((c - p) * 100n) / c) };
}
