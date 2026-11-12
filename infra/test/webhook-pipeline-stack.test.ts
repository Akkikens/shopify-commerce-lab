import { App, Duration } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { beforeAll, describe, expect, it } from 'vitest';
import { WebhookPipelineStack } from '../lib/webhook-pipeline-stack';

// Synthesizes the stack in-process (no AWS account, no deploy). Bundling is
// skipped via context so the test doesn't run esbuild for each Lambda.
let template: Template;

beforeAll(() => {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new WebhookPipelineStack(app, 'Test', {
    shopDomain: 'lab-dev.myshopify.com',
    reconcileSchedule: Schedule.rate(Duration.minutes(30)),
  });
  template = Template.fromStack(stack);
});

describe('WebhookPipelineStack', () => {
  it('exposes POST /webhooks/shopify on an HTTP API backed by the ingest Lambda', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /webhooks/shopify' });
    template.resourceCountIs('AWS::Lambda::Function', 3);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Timeout: 5,
      Environment: { Variables: Match.objectLike({ DEDUPE_TABLE_NAME: Match.anyValue(), WEBHOOK_QUEUE_URL: Match.anyValue(), SHOPIFY_SECRET_ARN: Match.anyValue() }) },
    });
  });

  it('dedupes with a DynamoDB table keyed on pk with TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('buffers through SQS with a DLQ after 5 receives and a visibility timeout of 6x the consumer timeout', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 180,
      RedrivePolicy: { deadLetterTargetArn: Match.anyValue(), maxReceiveCount: 5 },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { Threshold: 1, MetricName: 'ApproximateNumberOfMessagesVisible' });
  });

  it('stores events in an encrypted, private, versioned bucket that enforces TLS', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      VersioningConfiguration: { Status: 'Enabled' },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
    });
  });

  it('runs reconciliation from an EventBridge schedule rule', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(30 minutes)',
      State: 'ENABLED',
      Targets: [Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 2 } })],
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ SHOP_DOMAIN: 'lab-dev.myshopify.com', RECONCILE_MAX_ITEMS: '50' }) },
    });
  });

  it('grants least privilege: ingest can send to SQS but not read S3', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const ingestPolicy = Object.entries(policies).find(([id]) => id.startsWith('IngestFn'))?.[1];
    const actions = JSON.stringify(ingestPolicy);
    expect(actions).toContain('sqs:SendMessage');
    expect(actions).toContain('dynamodb:PutItem');
    expect(actions).not.toContain('s3:');
  });

  it('outputs the webhook URL to paste into shopify.app.toml', () => {
    template.hasOutput('WebhookUrl', {});
  });
});
