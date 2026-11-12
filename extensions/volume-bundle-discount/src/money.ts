/**
 * Decimal helpers. Shopify Functions exchange money as Decimal strings
 * ("19.99"); doing arithmetic in integer minor units avoids float drift
 * (0.1 + 0.2) when the result is written back as a Decimal.
 */
export function toCents(amount: string | number): number {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid decimal amount: ${String(amount)}`);
  }
  return Math.round(value * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
