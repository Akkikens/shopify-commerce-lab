import { verifyShopifyHmac } from './hmac';
import { MissingHeaderError, parseWebhookHeaders, type HeaderBag } from './headers';
import { parseShopifyJson } from './json';
import type { DedupeStore, Queue, SecretSource } from './ports';

export const SUPPORTED_TOPICS = ['orders/create', 'inventory_levels/update'] as const;
export type SupportedTopic = (typeof SUPPORTED_TOPICS)[number];

/** Shopify retries failed deliveries for up to 48h; keep dedupe keys a bit longer. */
export const DEDUPE_TTL_SECONDS = 72 * 60 * 60;

export interface IngestRequest {
  headers: HeaderBag;
  rawBody: Buffer;
}

export interface IngestResponse {
  statusCode: number;
  body: string;
}

export interface IngestDeps {
  secrets: SecretSource;
  dedupe: DedupeStore;
  queue: Queue;
  now?: () => Date;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

const json = (statusCode: number, body: Record<string, unknown>): IngestResponse => ({ statusCode, body: JSON.stringify(body) });

/**
 * Webhook ingest: verify → dedupe → enqueue → 200, and nothing slower.
 * Business logic runs in the SQS consumer so Shopify gets a fast response
 * and retries never cause double processing.
 */
export function createIngestHandler({ secrets, dedupe, queue, now = () => new Date(), log = () => {} }: IngestDeps) {
  return async function ingest(request: IngestRequest): Promise<IngestResponse> {
    let meta;
    try {
      meta = parseWebhookHeaders(request.headers);
    } catch (error) {
      if (error instanceof MissingHeaderError) return json(400, { error: error.message });
      throw error;
    }

    if (!verifyShopifyHmac(request.rawBody, meta.hmac, await secrets.webhookSecrets())) {
      log('webhook.rejected', { reason: 'hmac', webhookId: meta.webhookId, shop: meta.shopDomain });
      return json(401, { error: 'invalid signature' });
    }

    if (!(SUPPORTED_TOPICS as readonly string[]).includes(meta.topic)) {
      // Acknowledge so Shopify doesn't retry a topic we deliberately ignore.
      log('webhook.ignored', { topic: meta.topic, webhookId: meta.webhookId });
      return json(200, { status: 'ignored', topic: meta.topic });
    }

    let payload: unknown;
    try {
      payload = parseShopifyJson(request.rawBody.toString('utf8'));
    } catch {
      return json(400, { error: 'body is not JSON' });
    }

    const dedupeKey = `${meta.shopDomain}#${meta.webhookId}`;
    if (!(await dedupe.claim(dedupeKey, DEDUPE_TTL_SECONDS))) {
      log('webhook.duplicate', { webhookId: meta.webhookId, topic: meta.topic });
      return json(200, { status: 'duplicate' });
    }

    try {
      await queue.send({
        webhookId: meta.webhookId,
        topic: meta.topic,
        shopDomain: meta.shopDomain,
        triggeredAt: meta.triggeredAt,
        apiVersion: meta.apiVersion,
        receivedAt: now().toISOString(),
        payload,
      });
    } catch (error) {
      // Give the claim back, otherwise Shopify's retry would be dropped as a duplicate and the event lost.
      await dedupe.release(dedupeKey);
      log('webhook.enqueue_failed', { webhookId: meta.webhookId, error: String(error) });
      return json(500, { error: 'enqueue failed' });
    }

    log('webhook.accepted', { webhookId: meta.webhookId, topic: meta.topic, shop: meta.shopDomain });
    return json(200, { status: 'queued' });
  };
}
