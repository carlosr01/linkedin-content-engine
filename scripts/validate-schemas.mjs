import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadSchemas(schemaDirectory) {
  const entries = await fs.readdir(schemaDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'))
    .map((entry) => path.join(schemaDirectory, entry.name))
    .sort();

  if (files.length === 0) {
    throw new Error(`No *.schema.json files found in ${schemaDirectory}`);
  }

  const schemas = [];
  for (const file of files) {
    let schema;
    try {
      schema = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(
        `${path.basename(file)} is not valid JSON: ${error.message}`,
      );
    }
    schemas.push({ file, schema });
  }
  return schemas;
}

export function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

export function compileSchemas(schemas) {
  const ajv = createValidator();

  for (const { file, schema } of schemas) {
    if (!ajv.validateSchema(schema)) {
      const details = ajv.errorsText(ajv.errors, { separator: '; ' });
      throw new Error(
        `${path.basename(file)} is not a valid JSON Schema: ${details}`,
      );
    }
    ajv.addSchema(schema);
  }

  for (const { file, schema } of schemas) {
    try {
      ajv.getSchema(schema.$id);
    } catch (error) {
      throw new Error(
        `${path.basename(file)} could not be compiled: ${error.message}`,
      );
    }
  }

  return ajv;
}

async function main() {
  const root = path.resolve(process.cwd());
  const schemaDirectory = path.join(root, 'schemas');
  const schemas = await loadSchemas(schemaDirectory);
  compileSchemas(schemas);
  console.log(`Schema validation passed (${schemas.length} schemas).`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`Schema validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
