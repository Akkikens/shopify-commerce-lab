import { formatMoney } from '@shopify/hydrogen';
import { getSaving, type Money } from '~/lib/price';

/** Price vs compare-at price, formatted for the active market's locale with Hydrogen's formatMoney. */
export function Price({ price, compareAtPrice, locale }: { price: Money; compareAtPrice?: Money | null; locale: string }) {
  const saving = getSaving(price, compareAtPrice);
  return (
    <p className="price" data-testid="price">
      <span className="price-current" data-testid="price-current">
        {formatMoney(price, { locale }).toString()}
      </span>
      {saving ? (
        <>
          <s className="price-compare" data-testid="price-compare-at" aria-label="Regular price">
            {formatMoney(saving.compareAtPrice, { locale }).toString()}
          </s>
          <span className="price-badge" data-testid="price-saving">
            Save {saving.percentOff}%
          </span>
        </>
      ) : null}
    </p>
  );
}
