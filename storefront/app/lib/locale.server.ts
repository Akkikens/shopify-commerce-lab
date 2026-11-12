import type { StorefrontClient } from '@shopify/hydrogen';
import { data } from 'react-router';

/**
 * A `:locale` segment that didn't resolve to a configured market (e.g.
 * /xx/products/foo or /en-us/...) would render the default market under a
 * second URL — 404 instead so each page has one canonical URL.
 */
export function assertKnownLocale(client: StorefrontClient, param: string | undefined) {
  if (param && client.locale.pathPrefix === '') {
    throw data(null, { status: 404 });
  }
}
