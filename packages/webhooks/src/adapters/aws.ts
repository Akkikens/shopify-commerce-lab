import { ConditionalCheckFailedException, DeleteItemCommand, DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, ListObjectsV2Command, NoSuchKey, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { DedupeStore, ObjectStore, Queue, QueueMessage, SecretSource } from '../ports';

/** Idempotency keys in DynamoDB: conditional put = atomic "first writer wins"; TTL expires them. */
export function dynamoDedupeStore(client: DynamoDBClient, tableName: string, now: () => number = Date.now): DedupeStore {
  return {
    async claim(key, ttlSeconds) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              pk: { S: key },
              claimedAt: { N: String(Math.floor(now() / 1000)) },
              expiresAt: { N: String(Math.floor(now() / 1000) + ttlSeconds) },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },
    async release(key) {
      await client.send(new DeleteItemCommand({ TableName: tableName, Key: { pk: { S: key } } }));
    },
  };
}

export function sqsQueue(client: SQSClient, queueUrl: string): Queue {
  return {
    async send(message: QueueMessage) {
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            topic: { DataType: 'String', StringValue: message.topic },
            shop: { DataType: 'String', StringValue: message.shopDomain },
          },
        }),
      );
    },
  };
}

const isPreconditionFailure = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 412 || error.$metadata.httpStatusCode === 409 || error.name === 'PreconditionFailed');

/** S3 with conditional writes (If-Match / If-None-Match) for optimistic concurrency. */
export function s3ObjectStore(client: S3Client, bucket: string): ObjectStore {
  return {
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: (await res.Body?.transformToString('utf8')) ?? '', etag: res.ETag ?? '' };
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
    async put(key, body, condition) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            IfMatch: condition?.ifMatch,
            IfNoneMatch: condition?.ifNoneMatch,
          }),
        );
        return true;
      } catch (error) {
        if (isPreconditionFailure(error)) return false;
        throw error;
      }
    },
    async list(prefix) {
      const out: string[] = [];
      let token: string | undefined;
      do {
        const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const obj of res.Contents ?? []) if (obj.Key) out.push(obj.Key);
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
  };
}

export interface ShopifySecret {
  /** Current (and, during rotation, previous) app client secrets used to sign webhooks. */
  webhookSecrets: string[];
  /** Admin API access token for the reconciliation job (offline token / custom app token). */
  adminAccessToken?: string;
}

/** Secrets Manager JSON secret, cached per Lambda container for `ttlMs`. */
export function secretsManagerSource(client: SecretsManagerClient, secretId: string, ttlMs = 5 * 60 * 1000, now: () => number = Date.now) {
  let cached: { value: ShopifySecret; at: number } | null = null;
  const load = async (): Promise<ShopifySecret> => {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const value = JSON.parse(res.SecretString ?? '{}') as ShopifySecret;
    cached = { value: { webhookSecrets: value.webhookSecrets ?? [], adminAccessToken: value.adminAccessToken }, at: now() };
    return cached.value;
  };
  const source: SecretSource & { load: typeof load } = {
    load,
    async webhookSecrets() {
      return (await load()).webhookSecrets;
    },
  };
  return source;
}
