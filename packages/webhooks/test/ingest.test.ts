import { describe, expect, it } from 'vitest';
import { createIngestHandler, DEDUPE_TTL_SECONDS } from '../src/ingest';
import { parseShopifyJson } from '../src/json';
import { fixture, memoryDedupe, memoryQueue, signedRequest, staticSecrets, SECRET } from './helpers';

function setup() {
  const dedupe = memoryDedupe();
  const queue = memoryQueue();
  const ingest = createIngestHandler({ secrets: staticSecrets(SECRET), dedupe, queue, now: () => new Date('2026-11-12T18:15:01.000Z') });
  return { dedupe, queue, ingest };
}

describe('ingest handler', () => {
  const body = fixture('orders-create.json');

  it('verifies, dedupes and enqueues a valid webhook', async () => {
    const { ingest, queue, dedupe } = setup();
    await expect(ingest(signedRequest(body))).resolves.toEqual({ statusCode: 200, body: '{"status":"queued"}' });
    expect(queue.messages).toEqual([
      {
        webhookId: 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043',
        topic: 'orders/create',
        shopDomain: 'lab-dev.myshopify.com',
        triggeredAt: '2026-11-12T18:15:00.000Z',
        apiVersion: '2026-10',
        receivedAt: '2026-11-12T18:15:01.000Z',
        payload: parseShopifyJson(body),
      },
    ]);
    expect([...dedupe.keys]).toEqual(['lab-dev.myshopify.com#b54557e4-bdd9-4b37-8a5f-bf7d70bcd043']);
  });

  it('acknowledges a redelivery of the same webhook id without enqueueing it again', async () => {
    const { ingest, queue } = setup();
    await ingest(signedRequest(body));
    await expect(ingest(signedRequest(body))).resolves.toMatchObject({ statusCode: 200, body: '{"status":"duplicate"}' });
    expect(queue.messages).toHaveLength(1);
  });

  it('rejects a bad signature before touching dedupe or the queue', async () => {
    const { ingest, queue, dedupe } = setup();
    const res = await ingest(signedRequest(body, {}, 'attacker-secret'));
    expect(res.statusCode).toBe(401);
    expect(queue.messages).toHaveLength(0);
    expect(dedupe.keys.size).toBe(0);
  });

  it('returns 400 for missing headers or a non-JSON body', async () => {
    const { ingest } = setup();
    const missing = signedRequest(body);
    delete (missing.headers as Record<string, string>)['x-shopify-topic'];
    expect((await ingest(missing)).statusCode).toBe(400);
    expect((await ingest(signedRequest('not json'))).statusCode).toBe(400);
  });

  it('acks but ignores topics it does not handle', async () => {
    const { ingest, queue } = setup();
    const res = await ingest(signedRequest('{}', { 'x-shopify-topic': 'products/update' }));
    expect(res).toMatchObject({ statusCode: 200, body: '{"status":"ignored","topic":"products/update"}' });
    expect(queue.messages).toHaveLength(0);
  });

  it('releases the dedupe claim and returns 500 when SQS is down, so Shopify retries', async () => {
    const dedupe = memoryDedupe();
    const ingest = createIngestHandler({
      secrets: staticSecrets(SECRET),
      dedupe,
      queue: { send: async () => Promise.reject(new Error('SQS unavailable')) },
    });
    expect((await ingest(signedRequest(body))).statusCode).toBe(500);
    expect(dedupe.keys.size).toBe(0);
  });

  it('keeps dedupe keys for longer than Shopify retries (48h)', () => {
    expect(DEDUPE_TTL_SECONDS).toBeGreaterThan(48 * 3600);
  });
});
