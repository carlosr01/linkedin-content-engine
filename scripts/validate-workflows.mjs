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
