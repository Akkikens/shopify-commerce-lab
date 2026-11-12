import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { dynamoDedupeStore, secretsManagerSource, sqsQueue } from '../adapters/aws';
import { createIngestHandler } from '../ingest';
import { jsonLogger, requireEnv } from './env';

const ingest = createIngestHandler({
  secrets: secretsManagerSource(new SecretsManagerClient({}), requireEnv('SHOPIFY_SECRET_ARN')),
  dedupe: dynamoDedupeStore(new DynamoDBClient({}), requireEnv('DEDUPE_TABLE_NAME')),
  queue: sqsQueue(new SQSClient({}), requireEnv('WEBHOOK_QUEUE_URL')),
  log: jsonLogger,
});

/** API Gateway HTTP API (payload v2) → ingest. The body must stay byte-exact for HMAC. */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const rawBody = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
  const result = await ingest({ headers: event.headers, rawBody });
  return { statusCode: result.statusCode, body: result.body, headers: { 'content-type': 'application/json' } };
}
