/**
 * Shopify webhook payloads carry 64-bit integer IDs (e.g. 271878346596884015)
 * that exceed Number.MAX_SAFE_INTEGER; plain JSON.parse silently rounds them
 * (…884015 → …884000). This parser keeps any integer that isn't exactly
 * representable as its original digit string, using the reviver's `source`
 * context (JSON.parse source text access, Node 21+ / Lambda nodejs22.x+).
 */
type ReviverContext = { source?: string };

export function parseShopifyJson(text: string): unknown {
  return JSON.parse(text, function reviver(this: unknown, _key: string, value: unknown, context?: ReviverContext) {
    if (typeof value === 'number' && context?.source && /^-?\d+$/.test(context.source) && !Number.isSafeInteger(value)) {
      return context.source;
    }
    return value;
  } as (this: unknown, key: string, value: unknown) => unknown);
}
