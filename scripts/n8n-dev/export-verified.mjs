// Sólo acepta una relectura idéntica al workflow que se intentó guardar.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import prettier from 'prettier';
const [intendedPath, savedPath, outputPath, evidencePath] =
  process.argv.slice(2);
const read = async (path) => {
  const data = JSON.parse(await fs.readFile(path, 'utf8'));
  return Array.isArray(data) ? data[0] : data;
};
const intended = await read(intendedPath),
  saved = await read(savedPath);
for (const key of ['nodes', 'connections', 'settings', 'active', 'pinData'])
  assert.deepEqual(saved[key], intended[key], `persisted mismatch: ${key}`);
assert.equal(saved.active, false);
assert.equal(saved.activeVersionId, null);
const workflow = {
  name: saved.name,
  active: false,
  nodes: structuredClone(saved.nodes),
  connections: saved.connections,
  settings: saved.settings,
  pinData: {},
};
for (const node of workflow.nodes) {
  assert.ok(
    !/scheduleTrigger|cron|linkedIn|executeWorkflow|webhook/i.test(node.type),
  );
  delete node.credentials;
  node.id = createHash('sha256').update(node.name).digest('hex').slice(0, 32);
  if (node.parameters.dataTableId)
    node.parameters.dataTableId = {
      __rl: true,
      mode: 'id',
      value: 'BIND_EXISTING_DEV_CANDIDATES_TABLE',
    };
}
const serialized = await prettier.format(JSON.stringify(workflow), {
  ...(await prettier.resolveConfig(outputPath)),
  filepath: outputPath,
});
await fs.writeFile(outputPath, serialized);
await fs.writeFile(
  evidencePath,
  JSON.stringify(
    {
      workflowId: saved.id,
      workflowVersion: saved.versionId,
      active: saved.active,
      activeVersionId: saved.activeVersionId,
      readbackVerifiedAt: new Date().toISOString(),
      comparedFields: ['nodes', 'connections', 'settings', 'active', 'pinData'],
      exportPath: outputPath,
      exportSha256: createHash('sha256').update(serialized).digest('hex'),
      nodeVersions: [
        ...new Set(saved.nodes.map((n) => `${n.type}@${n.typeVersion}`)),
      ].sort(),
      sanitization: [
        'credential bindings removed',
        'data table bindings replaced',
        'node ids derived from names',
        'workflow instance metadata omitted',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('READBACK_AND_SANITIZATION=PASS');
