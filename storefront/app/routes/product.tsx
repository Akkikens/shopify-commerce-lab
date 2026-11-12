import { Link } from 'react-router';
import type { Route } from './+types/product';
import { Price } from '~/components/Price';
import { SpecTable } from '~/components/SpecTable';
import { intlLocale } from '~/lib/i18n';
import { assertKnownLocale } from '~/lib/locale.server';
import { PRODUCT_QUERY } from '~/lib/queries.server';
import { buildSpecRows } from '~/lib/specs';
import { storefrontContext } from '~/lib/storefront.server';

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.product.title} · Commerce Lab` : 'Product' }];

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const client = context.get(storefrontContext);
  assertKnownLocale(client, params.locale);

  // Variant selection lives in the URL (?Color=Black&Switch=Linear) so it's shareable and SSR'd.
  const selectedOptions = [...new URL(request.url).searchParams].map(([name, value]) => ({ name, value }));
  const { data, errors } = await client.graphql(PRODUCT_QUERY, { variables: { handle: params.handle, selectedOptions } });
  if (errors?.length) throw new Response('Storefront API error', { status: 502 });
  if (!data?.product) throw new Response('Not found', { status: 404 });

  const { product, localization } = data;
  return {
    locale: intlLocale(client.locale),
    pathPrefix: client.locale.pathPrefix,
    requestedCountry: client.locale.country,
    localization,
    product,
    specRows: buildSpecRows(product.specs),
    fallbackSpecs: [
      { label: 'Brand', value: product.vendor },
      { label: 'Category', value: product.productType },
      { label: 'SKU', value: product.selectedOrFirstAvailableVariant?.sku ?? '' },
    ].filter((row) => row.value),
  };
}

export default function ProductPage({ loaderData }: Route.ComponentProps) {
  const { product, locale, pathPrefix, localization, requestedCountry, specRows, fallbackSpecs } = loaderData;
  const variant = product.selectedOrFirstAvailableVariant;
  const selected = new Map(variant?.selectedOptions.map((o) => [o.name, o.value]));

  return (
    <article className="product">
      <div className="product-media">
        {product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText ?? product.title} /> : null}
      </div>
      <div className="product-info">
        <p className="muted">{product.vendor}</p>
        <h1>{product.title}</h1>
        {variant ? <Price price={variant.price} compareAtPrice={variant.compareAtPrice} locale={locale} /> : null}
        <p className="muted" data-testid="market-info">
          Market requested: {requestedCountry} · Priced in {localization.country.currency.isoCode} by the Storefront API (@inContext)
        </p>

        {product.options
          .filter((option) => option.optionValues.length > 1)
          .map((option) => (
            <fieldset key={option.name} className="option">
              <legend>{option.name}</legend>
              {option.optionValues.map((value) => {
                const params = new URLSearchParams(Object.fromEntries(selected));
                params.set(option.name, value.name);
                const active = selected.get(option.name) === value.name;
                return (
                  <Link key={value.name} to={`?${params}`} replace preventScrollReset aria-current={active ? 'true' : undefined} className="option-value">
                    {value.name}
                  </Link>
                );
              })}
            </fieldset>
          ))}

        <p className={variant?.availableForSale ? 'stock in' : 'stock out'}>{variant?.availableForSale ? 'In stock' : 'Sold out'}</p>
        <div className="description" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        <SpecTable rows={specRows} fallback={fallbackSpecs} />
        <p>
          <Link to={`${pathPrefix}/`}>← All products</Link>
        </p>
      </div>
    </article>
  );
}
