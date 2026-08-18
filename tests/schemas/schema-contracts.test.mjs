import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileSchemas,
  loadSchemas,
} from '../../scripts/validate-schemas.mjs';

const root = process.cwd();
const fixtureDirectory = path.join(root, 'tests', 'fixtures');
const schemas = await loadSchemas(path.join(root, 'schemas'));
const ajv = compileSchemas(schemas);

async function fixture(name) {
  return JSON.parse(
    await fs.readFile(path.join(fixtureDirectory, name), 'utf8'),
  );
}

test('accepts a valid content candidate', async () => {
  const validate = ajv.getSchema(
    'urn:linkedin-content-engine:schema:content-candidate',
  );
  assert.equal(validate(await fixture('valid-content-candidate.json')), true);
});

test('rejects relevance scores greater than 100', async () => {
  const validate = ajv.getSchema(
    'urn:linkedin-content-engine:schema:content-score',
  );
  assert.equal(
    validate(await fixture('invalid-content-score-over-100.json')),
    false,
  );
  assert.ok(validate.errors.some((error) => error.keyword === 'maximum'));
});

test('rejects an invalid approval action', async () => {
  const validate = ajv.getSchema('urn:linkedin-content-engine:schema:approval');
  assert.equal(validate(await fixture('invalid-approval-action.json')), false);
  assert.ok(validate.errors.some((error) => error.keyword === 'enum'));
});

test('rejects a candidate missing a required field', async () => {
  const validate = ajv.getSchema(
    'urn:linkedin-content-engine:schema:content-candidate',
  );
  assert.equal(
    validate(await fixture('invalid-candidate-missing-required.json')),
    false,
  );
  assert.ok(
    validate.errors.some(
      (error) =>
        error.keyword === 'required' &&
        error.params.missingProperty === 'contentHash',
    ),
  );
});
