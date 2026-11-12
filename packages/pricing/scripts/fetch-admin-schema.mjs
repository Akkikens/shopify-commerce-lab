// Downloads the public Admin GraphQL schema for one API version (the same
// unauthenticated proxy @shopify/api-codegen-preset uses) and writes SDL.
// Usage: node scripts/fetch-admin-schema.mjs [2026-10]
import { writeFileSync } from 'node:fs';
import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';

const version = process.argv[2] ?? '2026-10';
const res = await fetch(`https://shopify.dev/admin-graphql-direct-proxy/${version}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: getIntrospectionQuery() }),
});
if (!res.ok) throw new Error(`Schema download failed: ${res.status}`);
const { data } = await res.json();
const out = new URL(`../schema/admin-${version}.graphql`, import.meta.url);
writeFileSync(out, printSchema(buildClientSchema(data)));
console.log(`wrote ${out.pathname}`);
