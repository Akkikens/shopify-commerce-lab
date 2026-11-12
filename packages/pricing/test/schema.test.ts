import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import * as operations from '../src/graphql/operations';

// The pinned Admin schema is the public 2026-10 introspection result
// (scripts/fetch-admin-schema.mjs). If Shopify renames a field, this fails
// before anything reaches a store.
const schema = buildSchema(readFileSync(fileURLToPath(new URL('../schema/admin-2026-10.graphql', import.meta.url)), 'utf8'));

describe('Admin GraphQL documents', () => {
  it.each(Object.entries(operations))('%s validates against Admin API 2026-10', (_name, document) => {
    expect(validate(schema, parse(document)).map((e) => e.message)).toEqual([]);
  });
});
