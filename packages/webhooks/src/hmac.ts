import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Shopify signs the raw request body with the app's client secret
 * (HMAC-SHA256, base64) in X-Shopify-Hmac-Sha256. Verification must use the
 * exact bytes received — re-serialised JSON will not match.
 *
 * `secrets` accepts several values so a secret rotation can overlap.
 */
export function computeHmac(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

export function verifyShopifyHmac(rawBody: Buffer | string, signature: string | undefined | null, secrets: string[]): boolean {
  if (!signature) return false;
  const received = Buffer.from(signature, 'base64');
  // A valid SHA-256 digest is 32 bytes; anything else can't match and would make timingSafeEqual throw.
  if (received.length !== 32) return false;
  return secrets.some((secret) => secret.length > 0 && timingSafeEqual(Buffer.from(computeHmac(rawBody, secret), 'base64'), received));
}
