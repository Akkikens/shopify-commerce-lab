#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { WebhookPipelineStack } from '../lib/webhook-pipeline-stack';

const app = new App();
new WebhookPipelineStack(app, 'ShopifyCommerceLabWebhooks', {
  shopDomain: app.node.tryGetContext('shopDomain') ?? process.env.SHOP_DOMAIN ?? 'your-dev-store.myshopify.com',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
