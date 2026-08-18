import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'yaml';

const allowedSourceTypes = new Set([
  'rss',
  'blog',
  'company_publication',
  'newsletter',
  'manual_url',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactKeys(value, allowed, label) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(
    extras.length === 0,
    `${label} has unexpected keys: ${extras.join(', ')}`,
  );
}

function validateContentPolicy(value) {
  const keys = [
    'version',
    'minimum_relevance_score',
    'human_approval_required',
    'auto_publish',
    'allow_unsourced_claims',
    'allow_direct_copy',
    'default_language',
    'maximum_revision_attempts',
  ];
  assertExactKeys(value, keys, 'content policy');
  for (const key of keys)
    assert(key in value, `content policy is missing ${key}`);
  assert(value.version === 1, 'content policy version must be 1');
  assert(
    Number.isInteger(value.minimum_relevance_score) &&
      value.minimum_relevance_score >= 0 &&
      value.minimum_relevance_score <= 100,
    'minimum_relevance_score must be an integer from 0 to 100',
  );
  assert(
    value.human_approval_required === true,
    'human_approval_required must remain true',
  );
  assert(value.auto_publish === false, 'auto_publish must remain false');
  assert(
    value.allow_unsourced_claims === false,
    'allow_unsourced_claims must remain false',
  );
  assert(
    value.allow_direct_copy === false,
    'allow_direct_copy must remain false',
  );
  assert(
    /^[a-z]{2}$/.test(value.default_language),
    'default_language must be a two-letter code',
  );
  assert(
    Number.isInteger(value.maximum_revision_attempts) &&
      value.maximum_revision_attempts > 0,
    'maximum_revision_attempts must be a positive integer',
  );
}

function validateSources(value) {
  assertExactKeys(value, ['version', 'sources'], 'sources config');
  assert(value.version === 1, 'sources config version must be 1');
  assert(Array.isArray(value.sources), 'sources must be an array');
  const ids = new Set();
  for (const [index, source] of value.sources.entries()) {
    const label = `sources[${index}]`;
    assertExactKeys(
      source,
      [
        'id',
        'name',
        'type',
        'enabled',
        'url',
        'priority',
        'topics',
        'language',
      ],
      label,
    );
    assert(
      typeof source.id === 'string' && source.id.length > 0,
      `${label}.id is required`,
    );
    assert(!ids.has(source.id), `${label}.id must be unique`);
    ids.add(source.id);
    assert(
      typeof source.name === 'string' && source.name.length > 0,
      `${label}.name is required`,
    );
    assert(
      allowedSourceTypes.has(source.type),
      `${label}.type is not supported`,
    );
    assert(
      typeof source.enabled === 'boolean',
      `${label}.enabled must be boolean`,
    );
    assert(
      Number.isInteger(source.priority) &&
        source.priority >= 0 &&
        source.priority <= 100,
      `${label}.priority must be an integer from 0 to 100`,
    );
    assert(Array.isArray(source.topics), `${label}.topics must be an array`);
    assert(
      typeof source.language === 'string' && source.language.length > 0,
      `${label}.language is required`,
    );
    if (source.url !== null) {
      let parsed;
      try {
        parsed = new URL(source.url);
      } catch {
        throw new Error(`${label}.url must be an absolute URL or null`);
      }
      assert(
        ['http:', 'https:'].includes(parsed.protocol),
        `${label}.url must use HTTP(S)`,
      );
    }
    assert(
      source.type === 'manual_url' || source.url !== null,
      `${label}.url is required for configured sources`,
    );
  }
}

function validateRuntime(value) {
  assertExactKeys(
    value,
    [
      'version',
      'environment',
      'timezone',
      'dry_run',
      'workflow_ids',
      'defaults',
    ],
    'runtime config',
  );
  assert(value.version === 1, 'runtime config version must be 1');
  assert(
    ['development', 'test', 'production'].includes(value.environment),
    'environment is invalid',
  );
  assert(
    value.timezone === 'America/Lima',
    'bootstrap timezone must be America/Lima',
  );
  assert(typeof value.dry_run === 'boolean', 'dry_run must be boolean');
  assertExactKeys(
    value.workflow_ids,
    [
      'discovery',
      'reference_ingestion',
      'editorial',
      'approval_and_publishing',
      'analytics',
    ],
    'workflow_ids',
  );
  assertExactKeys(
    value.defaults,
    [
      'source_fetch_timeout_seconds',
      'maximum_candidates_per_run',
      'retry_attempts',
      'require_correlation_id',
    ],
    'runtime defaults',
  );
  assert(
    value.defaults.require_correlation_id === true,
    'correlation IDs must be required',
  );
}

export function validateConfig(filename, value) {
  if (filename === 'content-policy.example.yaml')
    return validateContentPolicy(value);
  if (filename === 'sources.example.yaml') return validateSources(value);
  if (filename === 'runtime.example.yaml') return validateRuntime(value);
  throw new Error(`No validator registered for ${filename}`);
}

async function main() {
  const configDirectory = path.join(process.cwd(), 'config');
  const files = (await fs.readdir(configDirectory))
    .filter((name) => name.endsWith('.example.yaml'))
    .sort();
  assert(files.length > 0, 'no configuration examples found');

  for (const filename of files) {
    let value;
    try {
      value = parse(
        await fs.readFile(path.join(configDirectory, filename), 'utf8'),
        {
          uniqueKeys: true,
        },
      );
    } catch (error) {
      throw new Error(`${filename} is not valid YAML: ${error.message}`);
    }
    validateConfig(filename, value);
  }
  console.log(`Configuration validation passed (${files.length} examples).`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`Configuration validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
