import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { ConditionalCheckFailedException, DeleteItemCommand, DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, ListObjectsV2Command, NoSuchKey, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { dynamoDedupeStore, s3ObjectStore, secretsManagerSource, sqsQueue } from '../src/adapters/aws';

const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const sqs = mockClient(SQSClient);
const sm = mockClient(SecretsManagerClient);

beforeEach(() => {
  ddb.reset();
  s3.reset();
  sqs.reset();
  sm.reset();
});

describe('dynamoDedupeStore', () => {
  it('claims with a conditional put and a TTL attribute', async () => {
    ddb.on(PutItemCommand).resolves({});
    const store = dynamoDedupeStore(new DynamoDBClient({}), 'dedupe', () => 1_700_000_000_000);
    await expect(store.claim('shop#wh', 60)).resolves.toBe(true);
    expect(ddb.commandCalls(PutItemCommand)[0]!.args[0].input).toEqual({
      TableName: 'dedupe',
      Item: { pk: { S: 'shop#wh' }, claimedAt: { N: '1700000000' }, expiresAt: { N: '1700000060' } },
      ConditionExpression: 'attribute_not_exists(pk)',
    });
  });

  it('reports a duplicate when the condition fails, and can release', async () => {
    ddb.on(PutItemCommand).rejects(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));
    ddb.on(DeleteItemCommand).resolves({});
    const store = dynamoDedupeStore(new DynamoDBClient({}), 'dedupe');
    await expect(store.claim('k', 60)).resolves.toBe(false);
    await store.release('k');
    expect(ddb.commandCalls(DeleteItemCommand)[0]!.args[0].input).toEqual({ TableName: 'dedupe', Key: { pk: { S: 'k' } } });
  });

  it('propagates other DynamoDB errors', async () => {
    ddb.on(PutItemCommand).rejects(new Error('throttled'));
    await expect(dynamoDedupeStore(new DynamoDBClient({}), 't').claim('k', 1)).rejects.toThrow('throttled');
  });
});

describe('sqsQueue', () => {
  it('sends JSON with topic/shop attributes', async () => {
    sqs.on(SendMessageCommand).resolves({ MessageId: '1' });
    const msg = { webhookId: 'w', topic: 'orders/create', shopDomain: 's', triggeredAt: null, apiVersion: null, receivedAt: 't', payload: {} };
    await sqsQueue(new SQSClient({}), 'https://sqs/q').send(msg);
    const input = sqs.commandCalls(SendMessageCommand)[0]!.args[0].input;
    expect(input.QueueUrl).toBe('https://sqs/q');
    expect(JSON.parse(input.MessageBody!)).toEqual(msg);
    expect(input.MessageAttributes?.topic?.StringValue).toBe('orders/create');
  });
});

describe('s3ObjectStore', () => {
  it('returns null for a missing key', async () => {
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'nope', $metadata: {} }));
    await expect(s3ObjectStore(new S3Client({}), 'b').get('k')).resolves.toBeNull();
  });

  it('passes If-Match / If-None-Match and maps 412 to false', async () => {
    s3.on(PutObjectCommand)
      .resolvesOnce({})
      .rejectsOnce(new S3ServiceException({ name: 'PreconditionFailed', $fault: 'client', $metadata: { httpStatusCode: 412 } }));
    const store = s3ObjectStore(new S3Client({}), 'b');
    await expect(store.put('k', '{}', { ifNoneMatch: '*' })).resolves.toBe(true);
    await expect(store.put('k', '{}', { ifMatch: '"etag"' })).resolves.toBe(false);
    const [first, second] = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    expect(first).toMatchObject({ Bucket: 'b', Key: 'k', IfNoneMatch: '*', ContentType: 'application/json' });
    expect(second).toMatchObject({ IfMatch: '"etag"' });
  });

  it('lists every page', async () => {
    s3.on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: 'a' }], IsTruncated: true, NextContinuationToken: 't' })
      .resolvesOnce({ Contents: [{ Key: 'b' }], IsTruncated: false });
    await expect(s3ObjectStore(new S3Client({}), 'b').list('p/')).resolves.toEqual(['a', 'b']);
  });
});

describe('secretsManagerSource', () => {
  it('parses the JSON secret and caches it per container', async () => {
    sm.on(GetSecretValueCommand).resolves({ SecretString: JSON.stringify({ webhookSecrets: ['s1', 's2'], adminAccessToken: 'shpat_x' }) });
    let t = 0;
    const source = secretsManagerSource(new SecretsManagerClient({}), 'arn', 1000, () => t);
    await expect(source.webhookSecrets()).resolves.toEqual(['s1', 's2']);
    t = 500;
    await source.webhookSecrets();
    expect(sm.commandCalls(GetSecretValueCommand)).toHaveLength(1);
    t = 1500;
    await expect(source.load()).resolves.toMatchObject({ adminAccessToken: 'shpat_x' });
    expect(sm.commandCalls(GetSecretValueCommand)).toHaveLength(2);
  });
});
