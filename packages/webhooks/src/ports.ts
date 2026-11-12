/** Narrow interfaces the handlers depend on; AWS adapters live in src/adapters. */

export interface DedupeStore {
  /** Atomically claim `key`. Returns false if it was already claimed (a duplicate). */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  /** Undo a claim so a retried delivery can be processed (used when enqueueing fails). */
  release(key: string): Promise<void>;
}

export interface QueueMessage {
  webhookId: string;
  topic: string;
  shopDomain: string;
  triggeredAt: string | null;
  apiVersion: string | null;
  receivedAt: string;
  payload: unknown;
}

export interface Queue {
  send(message: QueueMessage): Promise<void>;
}

export interface StoredObject {
  body: string;
  etag: string;
}

export interface ObjectStore {
  get(key: string): Promise<StoredObject | null>;
  /**
   * Conditional write. `ifMatch` = only overwrite this exact version;
   * `ifNoneMatch: '*'` = only create. Returns false when the precondition fails.
   */
  put(key: string, body: string, condition?: { ifMatch?: string; ifNoneMatch?: '*' }): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

export interface SecretSource {
  /** All currently valid webhook signing secrets (supports rotation). */
  webhookSecrets(): Promise<string[]>;
}
