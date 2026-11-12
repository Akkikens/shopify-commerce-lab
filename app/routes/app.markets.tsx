import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { listMarketPriceLists } from "@commerce-lab/pricing";

import { authenticate } from "../shopify.server";
import { toAdminClient } from "../lib/admin-client.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const markets = await listMarketPriceLists(toAdminClient(admin));
  return { markets };
};

export default function MarketsPage() {
  const { markets } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Markets & price lists">
      {markets.length === 0 ? (
        <s-section>
          <s-paragraph>No markets yet. Create one in Settings → Markets.</s-paragraph>
        </s-section>
      ) : (
        markets.map((market) => (
          <s-section key={market.marketId} heading={`${market.marketName} (${market.baseCurrency ?? "shop currency"})`}>
            {market.priceLists.length === 0 ? (
              <s-paragraph>No catalog price list — buyers see converted shop prices.</s-paragraph>
            ) : (
              <s-unordered-list>
                {market.priceLists.map((pl) => (
                  <s-list-item key={pl.id}>
                    {pl.name}: {pl.currency}, {pl.fixedPricesCount} fixed prices
                    {pl.adjustment ? `, base adjustment ${pl.adjustment}` : ""}
                  </s-list-item>
                ))}
              </s-unordered-list>
            )}
          </s-section>
        ))
      )}
    </s-page>
  );
}
