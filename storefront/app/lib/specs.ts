/**
 * Metafield-driven spec table. Each row is a product metafield (definition
 * namespace `specs`) rendered according to its metafield type, so merchandisers
 * add or change specs in Shopify admin without a storefront deploy.
 *
 * The identifiers here must match PRODUCT_QUERY's `metafields(identifiers:)`
 * list (enforced by specs.test.ts).
 */
export const SPEC_FIELDS = [
  { key: 'layout', label: 'Layout' },
  { key: 'switch_type', label: 'Switches' },
  { key: 'connectivity', label: 'Connectivity' },
  { key: 'polling_rate_hz', label: 'Polling rate', unit: 'Hz' },
  { key: 'weight', label: 'Weight' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'hot_swappable', label: 'Hot-swappable' },
  { key: 'warranty_years', label: 'Warranty', unit: 'years' },
] as const;

export const SPEC_NAMESPACE = 'specs';

export interface MetafieldLike {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface SpecRow {
  key: string;
  label: string;
  value: string;
}

const UNIT_LABELS: Record<string, string> = {
  GRAMS: 'g',
  KILOGRAMS: 'kg',
  OUNCES: 'oz',
  POUNDS: 'lb',
  MILLIMETERS: 'mm',
  CENTIMETERS: 'cm',
  METERS: 'm',
  INCHES: 'in',
};

function measurement(json: string): string | null {
  const parsed = JSON.parse(json) as { value?: number; unit?: string };
  if (typeof parsed.value !== 'number') return null;
  return `${parsed.value} ${UNIT_LABELS[parsed.unit ?? ''] ?? parsed.unit?.toLowerCase() ?? ''}`.trim();
}

/** Render a metafield's value by its type; null when the value can't be shown. */
export function formatMetafieldValue(field: MetafieldLike, unit?: string): string | null {
  try {
    switch (field.type) {
      case 'single_line_text_field':
      case 'multi_line_text_field':
        return field.value.trim() || null;
      case 'number_integer':
      case 'number_decimal':
        return unit ? `${field.value} ${unit}` : field.value;
      case 'boolean':
        return field.value === 'true' ? 'Yes' : 'No';
      case 'weight':
      case 'dimension':
      case 'volume':
        return measurement(field.value);
      case 'list.single_line_text_field': {
        const items = JSON.parse(field.value) as unknown;
        return Array.isArray(items) && items.length ? items.join(', ') : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function buildSpecRows(metafields: ReadonlyArray<MetafieldLike | null | undefined>): SpecRow[] {
  const byKey = new Map(
    metafields
      .filter((m): m is MetafieldLike => !!m && m.namespace === SPEC_NAMESPACE)
      .map((m) => [m.key, m] as const),
  );
  const rows: SpecRow[] = [];
  for (const spec of SPEC_FIELDS) {
    const field = byKey.get(spec.key);
    if (!field) continue;
    const value = formatMetafieldValue(field, 'unit' in spec ? spec.unit : undefined);
    if (value) rows.push({ key: spec.key, label: spec.label, value });
  }
  return rows;
}
