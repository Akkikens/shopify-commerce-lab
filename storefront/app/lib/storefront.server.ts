import { createShopifyRequestContext, createStorefrontClient, type StorefrontClient } from '@shopify/hydrogen';
import { createContext, type MiddlewareFunction } from 'react-router';
import { cacheContext, envContext, waitUntilContext } from './context.server';
import { i18n } from './i18n';

export const storefrontContext = createContext<StorefrontClient>();

export const DEFAULT_STORE_DOMAIN = 'mechanical-keyboards.mock.shop';

/**
 * One request-scoped Storefront API client per request. Public client:
 * tokenless against mock.shop, token-backed once PUBLIC_STOREFRONT_API_TOKEN is
 * set for a real store. Captured SFAPI response headers are merged into the
 * final response after the route renders.
 */
export const storefrontMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const env = context.get(envContext);
  const requestContext = createShopifyRequestContext({ request, i18n });
  const client = createStorefrontClient({
    type: 'public',
    requestContext,
    config: {
      storeDomain: env.PUBLIC_STORE_DOMAIN || DEFAULT_STORE_DOMAIN,
      publicStorefrontToken: env.PUBLIC_STOREFRONT_API_TOKEN || undefined,
      cache: context.get(cacheContext),
      waitUntil: context.get(waitUntilContext),
    },
  });
  context.set(storefrontContext, client);

  const response = await next();
  requestContext.applyResponseHeaders(response.headers);
  return response;
};
