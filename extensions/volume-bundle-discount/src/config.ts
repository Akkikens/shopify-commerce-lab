/**
 * Merchant configuration for the discount, stored as a JSON metafield on the
 * discount node (`$app:volume-bundle.function-configuration`). The same JSON
 * feeds the input query's `$bundleTags` variable via [extensions.input.variables].
 */
export interface VolumeTier {
  /** Minimum number of eligible units in the cart for this tier to apply. */
  minQuantity: number;
  /** Percentage off each eligible line, 0-100. */
  percentage: number;
}

export interface BundleRule {
  /** Fixed amount (shop currency, Decimal string) taken off the order per complete bundle. */
  amountOff: string;
  /** Upper bound on how many bundles are rewarded in one cart. */
  maxBundles: number;
  message: string;
}

export interface DiscountConfig {
  volumeTiers: VolumeTier[];
  /** One product tag per bundle slot, e.g. keyboard + mouse + headset. */
  bundleTags: string[];
  bundle: BundleRule | null;
}

export const DEFAULT_CONFIG: DiscountConfig = {
  volumeTiers: [
    { minQuantity: 3, percentage: 5 },
    { minQuantity: 5, percentage: 10 },
    { minQuantity: 10, percentage: 15 },
  ],
  bundleTags: [],
  bundle: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTiers(raw: unknown): VolumeTier[] {
  if (!Array.isArray(raw)) return DEFAULT_CONFIG.volumeTiers;
  const tiers = raw
    .filter(isRecord)
    .map((tier) => ({
      minQuantity: Math.floor(Number(tier.minQuantity)),
      percentage: Number(tier.percentage),
    }))
    .filter(
      (tier) =>
        Number.isFinite(tier.minQuantity) &&
        tier.minQuantity >= 1 &&
        Number.isFinite(tier.percentage) &&
        tier.percentage > 0 &&
        tier.percentage <= 100,
    );
  // Highest threshold first so the first match is the best tier.
  return tiers.sort((a, b) => b.minQuantity - a.minQuantity);
}

function parseBundle(raw: unknown): BundleRule | null {
  if (!isRecord(raw)) return null;
  const amount = Number.parseFloat(String(raw.amountOff));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const maxBundles = Math.floor(Number(raw.maxBundles ?? 1));
  return {
    amountOff: amount.toFixed(2),
    maxBundles: Number.isFinite(maxBundles) && maxBundles >= 1 ? maxBundles : 1,
    message: typeof raw.message === 'string' && raw.message ? raw.message : 'Bundle discount',
  };
}

/** Parse the metafield's jsonValue; anything malformed falls back to safe defaults. */
export function parseConfig(jsonValue: unknown): DiscountConfig {
  if (!isRecord(jsonValue)) {
    return { ...DEFAULT_CONFIG, volumeTiers: parseTiers(DEFAULT_CONFIG.volumeTiers) };
  }
  const bundleTags = Array.isArray(jsonValue.bundleTags)
    ? [...new Set(jsonValue.bundleTags.filter((t): t is string => typeof t === 'string' && t.length > 0))]
    : [];
  const bundle = parseBundle(jsonValue.bundle);
  return {
    volumeTiers: parseTiers(jsonValue.volumeTiers ?? DEFAULT_CONFIG.volumeTiers),
    bundleTags,
    // A bundle needs at least two distinct slots to mean anything.
    bundle: bundleTags.length >= 2 ? bundle : null,
  };
}

export function selectTier(tiers: VolumeTier[], units: number): VolumeTier | null {
  return tiers.find((tier) => units >= tier.minQuantity) ?? null;
}
