import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createAdminFetchClient } from '@commerce-lab/pricing';
import { s3ObjectStore, secretsManagerSource } from '../adapters/aws';
import { reconcileInventory } from '../reconcile';
import { jsonLogger, requireEnv } from './env';

const secrets = secretsManagerSource(new SecretsManagerClient({}), requireEnv('SHOPIFY_SECRET_ARN'));
const store = s3ObjectStore(new S3Client({}), requireEnv('EVENTS_BUCKET_NAME'));

/** Invoked by the EventBridge schedule rule. */
export async function handler() {
  const shop = requireEnv('SHOP_DOMAIN');
  const { adminAccessToken } = await secrets.load();
  if (!adminAccessToken) throw new Error('adminAccessToken missing from the Shopify secret');
  const report = await reconcileInventory({
    store,
    shop,
    admin: createAdminFetchClient({ shop, accessToken: adminAccessToken }),
    maxItems: Number(process.env.RECONCILE_MAX_ITEMS ?? 50),
  });
  jsonLogger('reconcile.completed', { ...report, drift: report.drift.length });
  return report;
}
