import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SQSEvent } from 'aws-lambda';
import { computeHmac } from '../src/hmac';
import type { DedupeStore, ObjectStore, Queue, QueueMessage, SecretSource } from '../src/ports';

export const SECRET = 'test-app-client-secret';

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

export function signedRequest(body: string, overrides: Record<string, string> = {}, secret = SECRET) {
  return {
    rawBody: Buffer.from(body),
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'lab-dev.myshopify.com',
      'x-shopify-webhook-id': 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043',
      'x-shopify-event-id': '98880550-7158-44d4-b7cd-2c97c8a091b5',
      'x-shopify-triggered-at': '2026-11-12T18:15:00.000Z',
      'x-shopify-api-version': '2026-10',
      'x-shopify-hmac-sha256': computeHmac(body, secret),
      ...overrides,
    },
  };
}

export const staticSecrets = (...secrets: string[]): SecretSource => ({ webhookSecrets: async () => secrets });

export function memoryDedupe(): DedupeStore & { keys: Set<string> } {
  const keys = new Set<string>();
  return {
    keys,
    async claim(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    async release(key) {
      keys.delete(key);
    },
  };
}

export function memoryQueue(): Queue & { messages: QueueMessage[] } {
  const messages: QueueMessage[] = [];
  return { messages, send: async (m) => void messages.push(structuredClone(m)) };
}

/** In-memory S3 stand-in with ETags and If-Match / If-None-Match semantics. */
export function memoryStore(): ObjectStore & { objects: Map<string, { body: string; etag: string }> } {
  const objects = new Map<string, { body: string; etag: string }>();
  let version = 0;
  return {
    objects,
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, body, condition) {
      const current = objects.get(key);
      if (condition?.ifNoneMatch === '*' && current) return false;
      if (condition?.ifMatch && current?.etag !== condition.ifMatch) return false;
      objects.set(key, { body, etag: `"v${(version += 1)}"` });
      return true;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

export function sqsEvent(messages: unknown[]): SQSEvent {
  return {
    Records: messages.map((m, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `rh-${i}`,
      body: typeof m === 'string' ? m : JSON.stringify(m),
      attributes: {} as never,
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-west-2:000000000000:webhooks',
      awsRegion: 'us-west-2',
    })),
  };
}
