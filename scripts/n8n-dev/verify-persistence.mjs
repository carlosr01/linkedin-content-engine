import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createValidator } from '../validate-schemas.mjs';
const [input, output] = process.argv.slice(2);
const bundles = JSON.parse(await fs.readFile(input, 'utf8'));
assert.ok(bundles.length > 0, 'No persisted bundles');
const ajv = createValidator();
const validators = {};
for (const [key, name] of Object.entries({
  source: 'source-record',
  candidate: 'content-candidate',
  score: 'content-score',
}))
  validators[key] = ajv.compile(
    JSON.parse(await fs.readFile(`schemas/${name}.schema.json`, 'utf8')),
  );
for (const b of bundles) {
  for (const [key, validate] of Object.entries(validators))
    assert.ok(validate(b[key]), key + ': ' + JSON.stringify(validate.errors));
  assert.equal(b.source.id, b.candidate.sourceId);
  assert.equal(b.score.candidateId, b.candidate.id);
  assert.equal(b.source.canonicalUrl, b.candidate.canonicalUrl);
  assert.equal(b.source.contentHash, b.candidate.contentHash);
  assert.ok(['SCORED', 'SELECTED'].includes(b.candidate.status));
}
await fs.writeFile(
  output,
  JSON.stringify(
    {
      status: 'PASS',
      readbackBundles: bundles.length,
      repositorySchemas: [
        'source-record',
        'content-candidate',
        'content-score',
      ],
      candidates: bundles.map((b) => ({
        candidateId: b.candidate.id,
        status: b.candidate.status,
        contentHash: b.candidate.contentHash,
        correlationId: b.provenance.correlationId,
        model: b.provenance.model,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log('PERSISTENCE_SCHEMA_READBACK=PASS');
