import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lambdaSrc = path.join(repoRoot, 'packages/webhooks/src/lambda');

export interface WebhookPipelineStackProps extends StackProps {
  /** e.g. lab-dev.myshopify.com — the shop the reconciliation job checks. */
  shopDomain: string;
  /** EventBridge schedule for reconciliation. */
  reconcileSchedule?: events.Schedule;
}

/**
 * Shopify webhooks → API Gateway (HTTP API) → ingest Lambda (HMAC + dedupe)
 * → SQS (+ DLQ) → consumer Lambda → S3, plus an EventBridge-scheduled
 * reconciliation Lambda that compares S3 state with the Admin API.
 */
export class WebhookPipelineStack extends Stack {
  readonly api: HttpApi;
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly bucket: s3.Bucket;
  readonly dedupeTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props: WebhookPipelineStackProps) {
    super(scope, id, props);

    // { "webhookSecrets": ["<app client secret>"], "adminAccessToken": "shpat_..." } — set after deploy.
    const shopifySecret = new secretsmanager.Secret(this, 'ShopifySecret', {
      description: 'Shopify app client secret(s) for webhook HMAC and Admin API token for reconciliation',
    });

    this.dedupeTable = new dynamodb.TableV2(this, 'WebhookDedupe', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.bucket = new s3.Bucket(this, 'EventsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        { prefix: 'events/', transitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) }] },
        { noncurrentVersionExpiration: Duration.days(30) },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.deadLetterQueue = new sqs.Queue(this, 'WebhookDlq', {
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    const consumerTimeout = Duration.seconds(30);
    this.queue = new sqs.Queue(this, 'WebhookQueue', {
      // AWS guidance: visibility timeout >= 6x the consumer's timeout.
      visibilityTimeout: Duration.seconds(consumerTimeout.toSeconds() * 6),
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 5 },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    const fnDefaults: Partial<NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, 'package-lock.json'),
      bundling: { format: OutputFormat.ESM, target: 'node24', sourceMap: true, mainFields: ['module', 'main'] },
      environment: { NODE_OPTIONS: '--enable-source-maps' },
      loggingFormat: lambda.LoggingFormat.JSON,
    };

    const ingestFn = new NodejsFunction(this, 'IngestFn', {
      ...fnDefaults,
      entry: path.join(lambdaSrc, 'ingest.ts'),
      timeout: Duration.seconds(5),
      logGroup: new logs.LogGroup(this, 'IngestLogs', { retention: logs.RetentionDays.ONE_MONTH }),
      environment: {
        ...fnDefaults.environment,
        SHOPIFY_SECRET_ARN: shopifySecret.secretArn,
        DEDUPE_TABLE_NAME: this.dedupeTable.tableName,
        WEBHOOK_QUEUE_URL: this.queue.queueUrl,
      },
    });
    shopifySecret.grantRead(ingestFn);
    this.dedupeTable.grantReadWriteData(ingestFn);
    this.queue.grantSendMessages(ingestFn);

    const consumerFn = new NodejsFunction(this, 'ConsumerFn', {
      ...fnDefaults,
      entry: path.join(lambdaSrc, 'consumer.ts'),
      timeout: consumerTimeout,
      logGroup: new logs.LogGroup(this, 'ConsumerLogs', { retention: logs.RetentionDays.ONE_MONTH }),
      environment: { ...fnDefaults.environment, EVENTS_BUCKET_NAME: this.bucket.bucketName },
    });
    this.bucket.grantReadWrite(consumerFn);
    consumerFn.addEventSource(
      new SqsEventSource(this.queue, { batchSize: 10, maxBatchingWindow: Duration.seconds(2), reportBatchItemFailures: true }),
    );

    const reconcileFn = new NodejsFunction(this, 'ReconcileFn', {
      ...fnDefaults,
      entry: path.join(lambdaSrc, 'reconcile.ts'),
      timeout: Duration.minutes(5),
      logGroup: new logs.LogGroup(this, 'ReconcileLogs', { retention: logs.RetentionDays.ONE_MONTH }),
      environment: {
        ...fnDefaults.environment,
        EVENTS_BUCKET_NAME: this.bucket.bucketName,
        SHOPIFY_SECRET_ARN: shopifySecret.secretArn,
        SHOP_DOMAIN: props.shopDomain,
        RECONCILE_MAX_ITEMS: '50',
      },
    });
    this.bucket.grantReadWrite(reconcileFn);
    shopifySecret.grantRead(reconcileFn);

    new events.Rule(this, 'ReconcileSchedule', {
      description: 'Scheduled inventory reconciliation (webhooks are not guaranteed delivery)',
      schedule: props.reconcileSchedule ?? events.Schedule.rate(Duration.hours(1)),
      targets: [new targets.LambdaFunction(reconcileFn, { retryAttempts: 2 })],
    });

    this.api = new HttpApi(this, 'WebhookApi', { description: 'Shopify webhook ingest' });
    this.api.addRoutes({
      path: '/webhooks/shopify',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('IngestIntegration', ingestFn),
    });

    new cloudwatch.Alarm(this, 'DlqNotEmpty', {
      alarmDescription: 'Webhook messages failed processing 5 times and landed in the DLQ',
      metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new CfnOutput(this, 'WebhookUrl', { value: `${this.api.apiEndpoint}/webhooks/shopify` });
    new CfnOutput(this, 'ShopifySecretArn', { value: shopifySecret.secretArn });
    new CfnOutput(this, 'EventsBucketName', { value: this.bucket.bucketName });
  }
}
