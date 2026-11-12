/**
 * Exact decimal money math in integer minor units (BigInt), so conversions and
 * rounding never pick up binary floating-point error.
 */
export interface Money {
  amount: string;
  currencyCode: string;
}

/**
 * ISO 4217 minor-unit digits. Intl knows the standard exponent for each
 * currency (JPY 0, USD 2, KWD 3), which is what Shopify uses for amounts.
 */
export function minorUnitDigits(currencyCode: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parse a decimal string into an integer scaled by 10^scale (half-up on extra digits). */
export function parseScaled(value: string, scale: number): bigint {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal: "${value}"`);
  const [, sign, whole, frac = ''] = match;
  const padded = frac.padEnd(scale + 1, '0');
  let scaled = BigInt(whole + padded.slice(0, scale));
  if (Number(padded[scale]) >= 5) scaled += 1n;
  return sign ? -scaled : scaled;
}

export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const frac = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${whole}${frac}`;
}

export function toMinor(money: Money): bigint {
  return parseScaled(money.amount, minorUnitDigits(money.currencyCode));
}

export function fromMinor(minor: bigint, currencyCode: string): Money {
  return { amount: formatScaled(minor, minorUnitDigits(currencyCode)), currencyCode };
}

/** Integer division rounding half away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  if (r === 0n) return q;
  const twice = (r < 0n ? -r : r) * 2n;
  const away = numerator < 0n !== denominator < 0n ? -1n : 1n;
  return twice >= (denominator < 0n ? -denominator : denominator) ? q + away : q;
}

export function divCeil(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  return numerator % denominator === 0n || numerator < 0n ? q : q + 1n;
}

const RATE_SCALE = 10;

/**
 * Convert `money` into `toCurrency` at `rate` (units of target per 1 unit of
 * source), rounding half-up to the target's minor units.
 */
export function convert(money: Money, toCurrency: string, rate: string): Money {
  const fromDigits = minorUnitDigits(money.currencyCode);
  const toDigits = minorUnitDigits(toCurrency);
  const amount = toMinor(money);
  const scaledRate = parseScaled(rate, RATE_SCALE);
  if (scaledRate <= 0n) throw new Error(`Exchange rate must be positive, got ${rate}`);
  // amount (10^fromDigits) * rate (10^RATE_SCALE) -> target (10^toDigits)
  const numerator = amount * scaledRate * 10n ** BigInt(toDigits);
  const denominator = 10n ** BigInt(fromDigits + RATE_SCALE);
  return fromMinor(divRoundHalfUp(numerator, denominator), toCurrency);
}

export function compareMoney(a: Money, b: Money): number {
  if (a.currencyCode !== b.currencyCode) {
    throw new Error(`Cannot compare ${a.currencyCode} with ${b.currencyCode}`);
  }
  const diff = toMinor(a) - toMinor(b);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}
