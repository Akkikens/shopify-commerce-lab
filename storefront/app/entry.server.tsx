import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

/** Web-streams SSR (Workers runtime) instead of the Node pipeable renderer. */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  let statusCode = responseStatusCode;
  const body = await renderToReadableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
    signal: request.signal,
    onError(error) {
      console.error(error);
      statusCode = 500;
    },
  });
  if (isbot(request.headers.get('user-agent'))) await body.allReady;
  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, { headers: responseHeaders, status: statusCode });
}
