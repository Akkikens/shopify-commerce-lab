import { Link } from 'react-router';
import type { Route } from './+types/home';
import { Price } from '~/components/Price';
import { intlLocale } from '~/lib/i18n';
import { assertKnownLocale } from '~/lib/locale.server';
import { HOME_QUERY } from '~/lib/queries.server';
import { storefrontContext } from '~/lib/storefront.server';

export const meta: Route.MetaFunction = () => [{ title: 'Commerce Lab storefront' }];

export async function loader({ context, params }: Route.LoaderArgs) {
  const client = context.get(storefrontContext);
  assertKnownLocale(client, params.locale);
  const { data, errors } = await client.graphql(HOME_QUERY);
  if (errors?.length || !data) throw new Response('Storefront API error', { status: 502 });
  return {
    pathPrefix: client.locale.pathPrefix,
    locale: intlLocale(client.locale),
    requestedCountry: client.locale.country,
    localization: data.localization,
    products: data.products.nodes,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { products, pathPrefix, locale, localization, requestedCountry } = loaderData;
  return (
    <>
      <section className="hero">
        <h1>Keyboards &amp; desk gear</h1>
        <p className="muted" data-testid="market-info">
          Market requested: {requestedCountry} · Storefront API priced in {localization.country.currency.isoCode}
        </p>
      </section>
      <ul className="grid" data-testid="product-grid">
        {products.map((product) => (
          <li key={product.id} className="card">
            <Link to={`${pathPrefix}/products/${product.handle}`} prefetch="intent">
              {product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText ?? product.title} loading="lazy" /> : null}
              <h2>{product.title}</h2>
            </Link>
            <Price price={product.priceRange.minVariantPrice} compareAtPrice={product.compareAtPriceRange.minVariantPrice} locale={locale} />
          </li>
        ))}
      </ul>
    </>
  );
}
