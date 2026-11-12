import { createRequestHandler, RouterContextProvider } from 'react-router';
import * as serverBuild from 'virtual:react-router/server-build';
import { createAppLoadContext } from './app/lib/context.server';

/** Oxygen module Worker. MiniOxygen runs this same file locally. */
export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    const handleRequest = createRequestHandler(serverBuild, import.meta.env.MODE);
    const context = await createAppLoadContext(env, executionContext, new RouterContextProvider());
    return handleRequest(request, context);
  },
};
