import type { CacheInstance } from '@shopify/hydrogen';
import { createContext, type RouterContextProvider } from 'react-router';

export const envContext = createContext<Env>();
export const waitUntilContext = createContext<ExecutionContext['waitUntil']>();
export const cacheContext = createContext<CacheInstance>();

/** Thread Oxygen's per-request env, waitUntil and Workers Cache into React Router context. */
export async function createAppLoadContext(
  env: Env,
  executionContext: ExecutionContext,
  provider: RouterContextProvider,
): Promise<RouterContextProvider> {
  provider.set(envContext, env);
  provider.set(waitUntilContext, executionContext.waitUntil.bind(executionContext));
  provider.set(cacheContext, await caches.open('hydrogen'));
  return provider;
}
