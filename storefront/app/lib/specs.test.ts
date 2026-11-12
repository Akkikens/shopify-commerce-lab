import { describe, expect, it } from 'vitest';
import { PRODUCT_QUERY } from './queries.server';
import { buildSpecRows, formatMetafieldValue, SPEC_FIELDS, SPEC_NAMESPACE } from './specs';

const mf = (key: string, type: string, value: string) => ({ namespace: SPEC_NAMESPACE, key, type, value });

describe('metafield spec table', () => {
  it('renders each metafield by its type, in SPEC_FIELDS order', () => {
    const rows = buildSpecRows([
      mf('warranty_years', 'number_integer', '2'),
      mf('layout', 'single_line_text_field', 'Tenkeyless (87 keys)'),
      mf('weight', 'weight', '{"value":1.2,"unit":"KILOGRAMS"}'),
      mf('connectivity', 'list.single_line_text_field', '["USB-C","2.4 GHz","Bluetooth 5.1"]'),
      mf('hot_swappable', 'boolean', 'true'),
      mf('polling_rate_hz', 'number_integer', '8000'),
      null,
    ]);
    expect(rows).toEqual([
      { key: 'layout', label: 'Layout', value: 'Tenkeyless (87 keys)' },
      { key: 'connectivity', label: 'Connectivity', value: 'USB-C, 2.4 GHz, Bluetooth 5.1' },
      { key: 'polling_rate_hz', label: 'Polling rate', value: '8000 Hz' },
      { key: 'weight', label: 'Weight', value: '1.2 kg' },
      { key: 'hot_swappable', label: 'Hot-swappable', value: 'Yes' },
      { key: 'warranty_years', label: 'Warranty', value: '2 years' },
    ]);
  });

  it('skips unknown types, malformed JSON and other namespaces', () => {
    expect(formatMetafieldValue(mf('weight', 'weight', 'not json'))).toBeNull();
    expect(formatMetafieldValue(mf('layout', 'file_reference', 'gid://shopify/MediaImage/1'))).toBeNull();
    expect(buildSpecRows([{ namespace: 'custom', key: 'layout', type: 'single_line_text_field', value: 'x' }])).toEqual([]);
  });

  it('queries exactly the metafields the table knows how to render', () => {
    const identifiers = [...String(PRODUCT_QUERY).matchAll(/\{ namespace: "(\w+)", key: "(\w+)" \}/g)].map(([, ns, key]) => `${ns}.${key}`);
    expect(identifiers).toEqual(SPEC_FIELDS.map((f) => `${SPEC_NAMESPACE}.${f.key}`));
  });
});
