import { getLocalizedHref, getSupportedLocales, isSameLocale } from '@shopify/hydrogen';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, useRouteLoaderData } from 'react-router';
import type { Route } from './+types/root';
import { MarketSwitcher } from './components/MarketSwitcher';
import { i18n } from './lib/i18n';
import { storefrontContext, storefrontMiddleware } from './lib/storefront.server';
import stylesHref from './styles/app.css?url';

export const middleware: Route.MiddlewareFunction[] = [storefrontMiddleware];

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: stylesHref }];

export async function loader({ context, request }: Route.LoaderArgs) {
  const client = context.get(storefrontContext);
  const current = client.locale;
  const url = new URL(request.url);
  const here = `${url.pathname}${url.search}`;
  const markets = getSupportedLocales(i18n).map((locale) => ({
    label: String((locale as { label?: string }).label ?? `${locale.language}-${locale.country}`),
    country: locale.country,
    href: getLocalizedHref(here, { i18n, locale }),
    active: isSameLocale(locale, current),
  }));
  return { locale: { language: current.language, country: current.country, pathPrefix: current.pathPrefix }, markets };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  return (
    <html lang={data?.locale.language.toLowerCase() ?? 'en'}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <header className="site-header">
          <a className="brand" href={data ? `${data.locale.pathPrefix}/` : '/'}>
            Commerce Lab
          </a>
          {data ? <MarketSwitcher markets={data.markets} /> : null}
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Hydrogen 2026.10 + React Router on Oxygen · catalog from mock.shop · not a real store
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <section className="error">
      <h1>{status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
      <p>Status {status}</p>
    </section>
  );
}
