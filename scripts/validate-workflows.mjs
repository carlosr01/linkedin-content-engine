import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function findJsonFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findJsonFiles(target)));
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(target);
  }
  return files.sort();
}

export function validateWorkflowShape(workflow, filename = 'workflow.json') {
  const errors = [];
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    return [`${filename}: root must be an object`];
  }
  if (typeof workflow.name !== 'string' || workflow.name.trim() === '') {
    errors.push(`${filename}: name must be a non-empty string`);
  }
  if (!Array.isArray(workflow.nodes)) {
    errors.push(`${filename}: nodes must be an array`);
  }
  if (
    !workflow.connections ||
    typeof workflow.connections !== 'object' ||
    Array.isArray(workflow.connections)
  ) {
    errors.push(`${filename}: connections must be an object`);
  }
  if (
    !workflow.settings ||
    typeof workflow.settings !== 'object' ||
    Array.isArray(workflow.settings)
  ) {
    errors.push(`${filename}: settings must be an object`);
  }

  if (Array.isArray(workflow.nodes)) {
    for (const [index, node] of workflow.nodes.entries()) {
      const prefix = `${filename}: nodes[${index}]`;
      for (const field of ['id', 'name', 'type']) {
        if (typeof node?.[field] !== 'string' || node[field].trim() === '') {
          errors.push(`${prefix}.${field} must be a non-empty string`);
        }
      }
      if (typeof node?.typeVersion !== 'number') {
        errors.push(`${prefix}.typeVersion must be a number`);
      }
      if (!Array.isArray(node?.position) || node.position.length !== 2) {
        errors.push(`${prefix}.position must be a two-number array`);
      }
      if (
        !node?.parameters ||
        typeof node.parameters !== 'object' ||
        Array.isArray(node.parameters)
      ) {
        errors.push(`${prefix}.parameters must be an object`);
      }
    }
  }
  return errors;
}

// CAR-197: an n8n `={{ ... }}` parameter whose source text contains a
// literal "}}" before its real closing delimiter risks the expression
// parser terminating early (observed as "invalid syntax" when the schema
// serialized into CAR-184's scorer prompt happened to end in nested closing
// braces). This is a structural, generator-independent check: any single
// full-expression string of exactly this shape is unsafe regardless of the
// content that produced it, so flagging it here catches the whole bug class
// for every current and future node parameter, not just the one CAR-197 fixed.
function collectExpressionStrings(value, pathParts, results) {
  if (typeof value === 'string') {
    if (value.startsWith('={{') && value.endsWith('}}')) {
      results.push({ path: pathParts.join('.'), value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) =>
      collectExpressionStrings(v, [...pathParts, i], results),
    );
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      collectExpressionStrings(v, [...pathParts, key], results);
    }
  }
}

export function findExpressionDelimiterRisks(
  workflow,
  filename = 'workflow.json',
) {
  const risks = [];
  if (!Array.isArray(workflow?.nodes)) return risks;
  for (const node of workflow.nodes) {
    const found = [];
    collectExpressionStrings(node?.parameters, ['parameters'], found);
    for (const { path: paramPath, value } of found) {
      const inner = value.slice(3, -2);
      if (inner.includes('}}')) {
        risks.push(
          `${filename}: node "${node?.name ?? '?'}" ${paramPath} contains a literal "}}" before the expression's closing delimiter, which can truncate the expression during n8n parsing`,
        );
      }
    }
  }
  return risks;
}

export async function validateWorkflowDirectory(workflowDirectory) {
  const files = await findJsonFiles(workflowDirectory);
  const errors = [];

  for (const file of files) {
    const relative = path.relative(workflowDirectory, file);
    let workflow;
    try {
      workflow = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      errors.push(`${relative}: invalid JSON (${error.message})`);
      continue;
    }
    errors.push(...validateWorkflowShape(workflow, relative));
    errors.push(...findExpressionDelimiterRisks(workflow, relative));
  }
  return { files, errors };
}

async function main() {
  const workflowDirectory = path.join(process.cwd(), 'workflows');
  const { files, errors } = await validateWorkflowDirectory(workflowDirectory);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  console.log(
    `Workflow repository validation passed (${files.length} JSON exports).`,
  );
  console.log(
    'Semantic n8n validation remains required in n8n DEV through current official Skills/MCP.',
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`Workflow validation failed:\n${error.message}`);
    process.exitCode = 1;
  });
}
