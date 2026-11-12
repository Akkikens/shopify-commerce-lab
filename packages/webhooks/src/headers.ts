/** Shopify webhook metadata. Header lookup is case-insensitive (API Gateway lowercases them). */
export interface WebhookMeta {
  topic: string;
  shopDomain: string;
  webhookId: string;
  eventId: string | null;
  triggeredAt: string | null;
  apiVersion: string | null;
  hmac: string | null;
}

export type HeaderBag = Record<string, string | undefined>;

export function header(headers: HeaderBag, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && value !== undefined) return value;
  }
  return null;
}

export class MissingHeaderError extends Error {
  constructor(readonly header: string) {
    super(`Missing required header ${header}`);
    this.name = 'MissingHeaderError';
  }
}

export function parseWebhookHeaders(headers: HeaderBag): WebhookMeta {
  const required = (name: string) => {
    const value = header(headers, name);
    if (!value) throw new MissingHeaderError(name);
    return value;
  };
  return {
    topic: required('X-Shopify-Topic'),
    shopDomain: required('X-Shopify-Shop-Domain'),
    webhookId: required('X-Shopify-Webhook-Id'),
    eventId: header(headers, 'X-Shopify-Event-Id'),
    triggeredAt: header(headers, 'X-Shopify-Triggered-At'),
    apiVersion: header(headers, 'X-Shopify-API-Version'),
    hmac: header(headers, 'X-Shopify-Hmac-Sha256'),
  };
}
