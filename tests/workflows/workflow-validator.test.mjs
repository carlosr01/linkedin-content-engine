import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateWorkflowDirectory,
  validateWorkflowShape,
} from '../../scripts/validate-workflows.mjs';

test('accepts the minimum repository workflow export shape', () => {
  const workflow = {
    name: 'Test-only workflow shape',
    nodes: [
      {
        id: 'node-1',
        name: 'Start',
        type: 'test.fixture',
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {},
    settings: {},
  };
  assert.deepEqual(validateWorkflowShape(workflow), []);
});

test('rejects missing workflow metadata', () => {
  const errors = validateWorkflowShape(
    { nodes: [], connections: {} },
    'missing.json',
  );
  assert.ok(errors.some((error) => error.includes('name')));
  assert.ok(errors.some((error) => error.includes('settings')));
});

test('reports malformed workflow JSON without claiming semantic validation', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'workflow-validator-'),
  );
  try {
    await fs.writeFile(
      path.join(directory, 'broken.json'),
      '{not-json',
      'utf8',
    );
    const result = await validateWorkflowDirectory(directory);
    assert.equal(result.files.length, 1);
    assert.ok(result.errors[0].includes('invalid JSON'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
