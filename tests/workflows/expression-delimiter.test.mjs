import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

import { findExpressionDelimiterRisks } from '../../scripts/validate-workflows.mjs';

const hash = (x) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');

function workflowWith(jsonBody) {
  return {
    nodes: [
      {
        id: 'n1',
        name: 'Score candidate with native LLM',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.5,
        position: [0, 0],
        parameters: { jsonBody },
      },
    ],
  };
}

// CAR-197: reproduce the exact defect using the real canonical schema and
// the real CAR-184 construction, not a contrived example.
test('CAR-184 old inline-expression construction is flagged (EXPRESSION_DELIMITER_COLLISION_REPRODUCED)', async () => {
  const schema = JSON.parse(
    await fs.readFile('schemas/content-score.schema.json', 'utf8'),
  );
  const prompt = await fs.readFile('prompts/content-scorer.md', 'utf8');
  const policy = parse(
    await fs.readFile('config/content-policy.example.yaml', 'utf8'),
  );
  const scorerSystemPrompt =
    prompt +
    '\nCopy candidateId exactly from untrustedCandidate.id. Return only JSON. No tools or actions.' +
    '\nThe JSON you return must validate exactly against this JSON Schema. Do not add, omit, or rename any property, and do not wrap it in another object:\n' +
    JSON.stringify(schema);

  const oldJsonBody =
    '={{ JSON.stringify({model: ' +
    JSON.stringify('deepseek/deepseek-v4-flash-0731') +
    ', temperature: 0, max_tokens: 2000' +
    ', response_format: {type: "json_object"}, reasoning: {effort: ' +
    JSON.stringify('low') +
    '}, messages: [{role: "system", content: ' +
    JSON.stringify(scorerSystemPrompt) +
    '}, {role: "user", content: JSON.stringify({policy: ' +
    JSON.stringify(policy) +
    ', brandContext: "No brand context supplied; score conservatively and describe missing evidence.", untrustedCandidate: $("Process candidates sequentially").item.json.candidate})}]}) }}';

  const risks = findExpressionDelimiterRisks(
    workflowWith(oldJsonBody),
    'old.json',
  );
  assert.equal(risks.length, 1, 'OLD_IMPLEMENTATION_FAILS=YES');
  assert.match(risks[0], /Score candidate with native LLM/);
  assert.match(risks[0], /parameters\.jsonBody/);
});

test('CAR-197 new indirection through $json.scorerRequestBody parses cleanly', () => {
  const newJsonBody = '={{ JSON.stringify($json.scorerRequestBody) }}';
  const risks = findExpressionDelimiterRisks(
    workflowWith(newJsonBody),
    'new.json',
  );
  assert.deepEqual(risks, [], 'NEW_IMPLEMENTATION_PARSES=YES');
});

test('a contrived expression with an embedded "}}" is still caught generically', () => {
  const risks = findExpressionDelimiterRisks(
    workflowWith('={{ JSON.stringify({a: {b: 1}}) }}'),
    'contrived.json',
  );
  assert.equal(risks.length, 1);
});

test('short benign expressions are never false-flagged', () => {
  const workflow = {
    nodes: [
      {
        id: 'n1',
        name: 'Fetch bounded public RSS source',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.5,
        position: [0, 0],
        parameters: {
          url: '={{ $json.source.url }}',
          options: { timeout: 30000 },
        },
      },
    ],
  };
  assert.deepEqual(findExpressionDelimiterRisks(workflow, 'benign.json'), []);
});

// CAR-197: the fix moves schema embedding into a Code node's jsCode (plain
// JS, not `={{ }}`-scanned) instead of changing how the schema itself is
// serialized. Prove the schema the model receives round-trips exactly to
// the canonical file — same construction the "Build scorer request body"
// Code node in prepare-update.mjs performs.
test('CANONICAL_SCHEMA_RECONSTRUCTS_EXACTLY through the new Code node construction', async () => {
  const schema = JSON.parse(
    await fs.readFile('schemas/content-score.schema.json', 'utf8'),
  );
  const prompt = await fs.readFile('prompts/content-scorer.md', 'utf8');
  const policy = parse(
    await fs.readFile('config/content-policy.example.yaml', 'utf8'),
  );
  const scorerSystemPrompt =
    prompt +
    '\nCopy candidateId exactly from untrustedCandidate.id. Return only JSON. No tools or actions.' +
    '\nThe JSON you return must validate exactly against this JSON Schema. Do not add, omit, or rename any property, and do not wrap it in another object:\n' +
    JSON.stringify(schema);

  const scorerModelId = 'deepseek/deepseek-v4-flash-0731';
  const SCORER_MAX_TOKENS = 2000;
  const SCORER_REASONING_EFFORT = 'low';
  const jsCode = `const candidate=$('Process candidates sequentially').item.json.candidate;const body={model:${JSON.stringify(scorerModelId)},temperature:0,max_tokens:${SCORER_MAX_TOKENS},response_format:{type:'json_object'},reasoning:{effort:${JSON.stringify(SCORER_REASONING_EFFORT)}},messages:[{role:'system',content:${JSON.stringify(scorerSystemPrompt)}},{role:'user',content:JSON.stringify({policy:${JSON.stringify(policy)},brandContext:'No brand context supplied; score conservatively and describe missing evidence.',untrustedCandidate:candidate})}]};return {json:{...$json,scorerRequestBody:body}};`;

  // eslint-disable-next-line no-new-func
  const fn = new Function('$', '$json', jsCode);
  const fakeCandidate = { id: 'candidate-abc' };
  const $ = () => ({ item: { json: { candidate: fakeCandidate } } });
  const result = fn($, { correlationId: 'wf01-test' });
  const body = result.json.scorerRequestBody;

  const finalJsonBody = JSON.stringify(body);
  const reparsedBody = JSON.parse(finalJsonBody);
  const marker =
    'The JSON you return must validate exactly against this JSON Schema. Do not add, omit, or rename any property, and do not wrap it in another object:\n';
  const systemContent = reparsedBody.messages[0].content;
  const embeddedSchemaText = systemContent.slice(
    systemContent.indexOf(marker) + marker.length,
  );
  const reconstructedSchema = JSON.parse(embeddedSchemaText);

  assert.equal(hash(reconstructedSchema), hash(schema));
});
