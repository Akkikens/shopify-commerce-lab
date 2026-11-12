import type { CodegenConfig } from '@graphql-codegen/cli';

// Types for the operations in src/graphql, generated from the pinned Admin API
// schema (schema/admin-2026-10.graphql). Only operation-relevant types are emitted.
const config: CodegenConfig = {
  schema: 'schema/admin-2026-10.graphql',
  documents: ['src/graphql/**/*.ts'],
  generates: {
    'src/generated/admin.types.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        onlyOperationTypes: true,
        enumsAsTypes: true,
        skipTypename: true,
        useTypeImports: true,
        scalars: { Decimal: 'string', Money: 'string', DateTime: 'string', URL: 'string', JSON: 'unknown' },
      },
    },
  },
};

export default config;
