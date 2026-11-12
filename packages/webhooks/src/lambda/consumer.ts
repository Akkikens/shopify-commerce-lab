import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { s3ObjectStore } from '../adapters/aws';
import { createConsumerHandler } from '../consumer';
import { jsonLogger, requireEnv } from './env';

const consume = createConsumerHandler({ store: s3ObjectStore(new S3Client({}), requireEnv('EVENTS_BUCKET_NAME')), log: jsonLogger });

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  return consume(event);
}
