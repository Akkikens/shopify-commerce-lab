export interface MarketLink {
  label: string;
  country: string;
  href: string;
  active: boolean;
}

/** Plain links (no JS needed): each points at the same page under another market prefix. */
export function MarketSwitcher({ markets }: { markets: MarketLink[] }) {
  return (
    <nav aria-label="Market" className="market-switcher">
      {markets.map((market) => (
        <a key={market.country} href={market.href} aria-current={market.active ? 'true' : undefined} data-country={market.country}>
          {market.label}
        </a>
      ))}
    </nav>
  );
}
