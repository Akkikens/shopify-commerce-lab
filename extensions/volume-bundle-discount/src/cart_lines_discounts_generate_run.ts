import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  type CartOperation,
} from '../generated/api';
import { parseConfig, selectTier, type DiscountConfig } from './config';
import { fromCents, toCents } from './money';

type CartLine = CartInput['cart']['lines'][number];

interface EligibleLine {
  id: string;
  quantity: number;
  /** Tags (from config.bundleTags) this line's product carries. */
  bundleTags: string[];
}

function toEligibleLine(line: CartLine): EligibleLine | null {
  if (line.merchandise.__typename !== 'ProductVariant') return null;
  const { product } = line.merchandise;
  if (product.isGiftCard) return null;
  return {
    id: line.id,
    quantity: line.quantity,
    bundleTags: product.hasTags.filter((t) => t.hasTag).map((t) => t.tag),
  };
}

/** Tiered volume pricing: total eligible units select one tier, applied to every eligible line. */
export function volumeOperation(lines: EligibleLine[], config: DiscountConfig): CartOperation | null {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const tier = selectTier(config.volumeTiers, units);
  if (!tier || lines.length === 0) return null;
  return {
    productDiscountsAdd: {
      selectionStrategy: ProductDiscountSelectionStrategy.First,
      candidates: [
        {
          message: `${tier.percentage}% off (${tier.minQuantity}+ items)`,
          targets: lines.map((line) => ({ cartLine: { id: line.id } })),
          value: { percentage: { value: tier.percentage } },
        },
      ],
    },
  };
}

/**
 * Bundle: one complete bundle = one unit of every configured tag. The number of
 * complete bundles is the minimum unit count across slots, capped by maxBundles.
 */
export function countCompleteBundles(lines: EligibleLine[], tags: string[]): number {
  if (tags.length === 0) return 0;
  const unitsPerTag = tags.map((tag) =>
    lines.filter((line) => line.bundleTags.includes(tag)).reduce((sum, line) => sum + line.quantity, 0),
  );
  return Math.min(...unitsPerTag);
}

export function bundleOperation(lines: EligibleLine[], config: DiscountConfig): CartOperation | null {
  const { bundle, bundleTags } = config;
  if (!bundle) return null;
  const bundles = Math.min(countCompleteBundles(lines, bundleTags), bundle.maxBundles);
  if (bundles < 1) return null;
  return {
    orderDiscountsAdd: {
      selectionStrategy: OrderDiscountSelectionStrategy.First,
      candidates: [
        {
          message: bundles > 1 ? `${bundle.message} x${bundles}` : bundle.message,
          targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
          value: { fixedAmount: { amount: fromCents(toCents(bundle.amountOff) * bundles) } },
        },
      ],
    },
  };
}

export function cartLinesDiscountsGenerateRun(input: CartInput): CartLinesDiscountsGenerateRunResult {
  const { discountClasses } = input.discount;
  const wantsProduct = discountClasses.includes(DiscountClass.Product);
  const wantsOrder = discountClasses.includes(DiscountClass.Order);
  if (input.cart.lines.length === 0 || (!wantsProduct && !wantsOrder)) {
    return { operations: [] };
  }

  const config = parseConfig(input.discount.metafield?.jsonValue);
  const lines = input.cart.lines.map(toEligibleLine).filter((l): l is EligibleLine => l !== null);

  const operations: CartOperation[] = [];
  if (wantsProduct) {
    const op = volumeOperation(lines, config);
    if (op) operations.push(op);
  }
  if (wantsOrder) {
    const op = bundleOperation(lines, config);
    if (op) operations.push(op);
  }
  return { operations };
}
