// Builds the function to WASM with the Shopify CLI and runs every fixture through
// Shopify's function-runner, validating input query, input and expected output
// against the Function API schema. No store or Partner account is needed.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, beforeAll, test, expect } from 'vitest';
import {
  buildFunction,
  getFunctionInfo,
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
  runFunction,
} from '@shopify/shopify-function-test-helpers';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const functionDir = path.dirname(testsDir);

describe('volume-bundle-discount (WASM via function-runner)', () => {
  let schema;
  let info;

  beforeAll(async () => {
    await buildFunction(functionDir);
    info = await getFunctionInfo(functionDir);
    schema = await loadSchema(info.schemaPath);
  }, 180000);

  const fixturesDir = path.join(testsDir, 'fixtures');
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(fixturesDir, file));

  test.each(fixtureFiles.map((f) => [path.basename(f), f]))('runs %s', async (_name, fixtureFile) => {
    const fixture = await loadFixture(fixtureFile);
    const inputQueryPath = info.targeting[fixture.target].inputQueryPath;
    const inputQueryAST = await loadInputQuery(inputQueryPath);

    const validation = await validateTestAssets({ schema, fixture, inputQueryAST });
    expect(validation.inputQuery.errors).toEqual([]);
    expect(validation.inputFixture.errors).toEqual([]);
    expect(validation.outputFixture.errors).toEqual([]);

    const run = await runFunction(fixture, info.functionRunnerPath, info.wasmPath, inputQueryPath, info.schemaPath);
    expect(run.error).toBeNull();
    expect(run.result.output).toEqual(fixture.expectedOutput);
  });
});
