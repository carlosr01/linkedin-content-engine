// Actualización basada en export y definiciones LIVE; no es el export versionado.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { createValidator } from '../validate-schemas.mjs';
import { parse } from 'yaml';
const [livePath, typesPath, target] = process.argv.slice(2);
if (!target)
  throw Error('Uso: prepare-update.mjs LIVE_EXPORT NODE_TYPES OUTPUT');
const live = JSON.parse(await fs.readFile(livePath, 'utf8'));
const w = (Array.isArray(live) ? live : [live]).find(
  (w) => w.name === 'WF01__content_discovery',
);
if (!w || w.active || w.activeVersionId)
  throw Error('WF01 debe existir y estar inactivo');
const definitions = JSON.parse(await fs.readFile(typesPath, 'utf8'));
const policy = parse(
  await fs.readFile('config/content-policy.example.yaml', 'utf8'),
);
const catalog = parse(await fs.readFile('config/sources.example.yaml', 'utf8'));
const prompt = await fs.readFile('prompts/content-scorer.md', 'utf8');
const hash = (x) => createHash('sha256').update(x).digest('hex');
const nodes = [];
const old = new Map(w.nodes.map((n) => [n.name, n]));
function node(name, type, version, parameters, extra = {}) {
  if (
    !definitions.some(
      (d) =>
        d.name === type &&
        (Array.isArray(d.version) ? d.version : [d.version]).includes(version),
    )
  )
    throw Error('Tipo live ausente: ' + type);
  const n = {
    id: old.get(name)?.id || hash(name).slice(0, 32),
    name,
    type,
    typeVersion: version,
    position: [nodes.length * 220, 0],
    parameters,
    ...extra,
  };
  nodes.push(n);
  return n;
}
const code = (name, jsCode, mode = 'runOnceForEachItem') =>
  node(
    name,
    'n8n-nodes-base.code',
    2,
    { mode, jsCode },
    { onError: 'continueErrorOutput' },
  );
const branch = (name, expr) =>
  node(name, 'n8n-nodes-base.if', 2.3, {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
      conditions: [
        {
          leftValue: expr,
          rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    options: {},
  });
const numericBranch = (name, expr, rightValue, operation) =>
  node(name, 'n8n-nodes-base.if', 2.3, {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
      conditions: [
        {
          leftValue: expr,
          rightValue,
          operator: { type: 'number', operation },
        },
      ],
      combinator: 'and',
    },
    options: {},
  });
async function bundle(source, globalName) {
  return (
    await build({
      stdin: { contents: source, resolveDir: process.cwd(), loader: 'js' },
      bundle: true,
      write: false,
      format: 'iife',
      globalName,
      platform: 'browser',
      minify: true,
    })
  ).outputFiles[0].text;
}
const ajv = createValidator();
ajv.opts.code.source = true;
const schemaSources = {};
for (const name of ['source-record', 'content-candidate', 'content-score']) {
  const schema = JSON.parse(
    await fs.readFile(`schemas/${name}.schema.json`, 'utf8'),
  );
  schemaSources[name] = schema;
  ajv.addSchema(schema);
}
const validation = await bundle(
  standaloneCode(ajv, {
    source: 'urn:linkedin-content-engine:schema:source-record',
    candidate: 'urn:linkedin-content-engine:schema:content-candidate',
    score: 'urn:linkedin-content-engine:schema:content-score',
  }),
  'validators',
);
const normalization = await bundle(
  "import {normalizeFeeds} from './lib/discovery/n8n/normalize.mjs'; module.exports = {normalizeFeeds};",
  'normalizer',
);
node('Manual DEV test trigger', 'n8n-nodes-base.manualTrigger', 1, {});
node('Create bounded DEV run context', 'n8n-nodes-base.set', 3.5, {
  mode: 'raw',
  jsonOutput: JSON.stringify({
    environment: 'development',
    maximumCandidatesPerRun: 25,
    sources: catalog.sources
      .filter((s) => s.enabled && s.type !== 'manual_url')
      .slice(0, 5),
  }),
  options: {},
});
node('Expand enabled sources', 'n8n-nodes-base.splitOut', 1, {
  fieldToSplitOut: 'sources',
  include: 'allOtherFields',
  options: { destinationFieldName: 'source' },
});
node('Process sources sequentially', 'n8n-nodes-base.splitInBatches', 3, {
  batchSize: 1,
  options: {},
});
code(
  'Prepare bounded request',
  `if($json.environment!=='development'||!$json.source?.enabled)throw Error('dev_only');return {json:{...$json,attempt:$json.attempt??1,correlationId:'wf01-'+$execution.id}};`,
);
node(
  'Fetch bounded public RSS source',
  'n8n-nodes-base.httpRequest',
  4.5,
  {
    url: '={{ $json.source.url }}',
    options: {
      timeout: 30000,
      redirect: { redirect: { followRedirects: false } },
      response: {
        response: {
          fullResponse: true,
          neverError: true,
          responseFormat: 'text',
          outputPropertyName: 'rssXml',
        },
      },
    },
  },
  { onError: 'continueRegularOutput' },
);
code(
  'Classify fetch result',
  `const context=$('Prepare bounded request').item.json;const status=$json.statusCode;const success=status>=200&&status<300;const transient=Boolean($json.error)||status===429||status>=500;const raw=$json.headers?.['retry-after'];let delay=1000*2**(context.attempt-1);if(raw!==undefined){const seconds=Number(raw);const requested=Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now();if(!Number.isFinite(requested)||requested<0)return {json:{...context,sourceError:'invalid_retry_after',retry:false}};delay=Math.max(delay,requested);}const retry=!success&&transient&&context.attempt<3&&delay<=30000;return {json:{...context,rssXml:success?($json.body??$json.rssXml??$json.data):'',sourceError:success?null:status===429?'rate_limited':$json.error?'timeout_or_network':'upstream_failed',retry,delayMs:delay,attempt:retry?context.attempt+1:context.attempt}};`,
);
branch('Retry transient source', '={{ $json.retry === true }}');
node('Respect retry delay', 'n8n-nodes-base.wait', 1.1, {
  resume: 'timeInterval',
  amount: '={{ $json.delayMs / 1000 }}',
  unit: 'seconds',
});
branch('Keep successful sources', '={{ $json.sourceError === null }}');
code(
  'Bound RSS payload',
  `if(typeof $json.rssXml!=='string'||$json.rssXml.length>2000000||/<!DOCTYPE|<!ENTITY/i.test($json.rssXml))throw Error('invalid_rss');return {json:$json};`,
);
node(
  'Parse RSS XML safely',
  'n8n-nodes-base.xml',
  1,
  {
    dataPropertyName: 'rssXml',
    options: {
      explicitArray: true,
      explicitRoot: true,
      normalize: false,
      trim: false,
    },
  },
  { onError: 'continueErrorOutput' },
);
code(
  'Normalize untrusted RSS entries',
  `${normalization}\nreturn normalizer.normalizeFeeds($input.all(),i=>$('Keep successful sources').itemMatching(i).json,Math.min(25,$('Create bounded DEV run context').first().json.maximumCandidatesPerRun));`,
  'runOnceForAllItems',
);
branch(
  'Keep schema-candidate normalized entries',
  "={{ $json.normalizationStatus === 'VALID' }}",
);
node('SHA-256 canonical URL', 'n8n-nodes-base.crypto', 2, {
  action: 'hash',
  type: 'SHA256',
  value: '={{ $json.canonicalUrl }}',
  dataPropertyName: 'urlHash',
});
node('SHA-256 normalized content', 'n8n-nodes-base.crypto', 2, {
  action: 'hash',
  type: 'SHA256',
  value: '={{ $json.contentHashMaterial }}',
  dataPropertyName: 'contentHash',
});
code(
  'Validate discovery contracts',
  `${validation}\nconst d=$json;const sourceRecord={id:'source-'+d.urlHash,name:d.source.name,type:d.source.type,originalUrl:d.sourceUrl,canonicalUrl:d.canonicalUrl,title:d.title,author:d.author,publishedAt:d.publishedAt,retrievedAt:d.retrievedAt,language:d.source.language,contentHash:d.contentHash,extractedText:d.extractedText};const candidate={id:'candidate-'+d.urlHash,sourceId:sourceRecord.id,sourceType:sourceRecord.type,sourceUrl:d.sourceUrl,sourceTitle:d.title,sourceAuthor:d.author,sourcePublishedAt:d.publishedAt,discoveredAt:d.retrievedAt,rawSummary:d.extractedText,canonicalUrl:d.canonicalUrl,contentHash:d.contentHash,language:d.source.language,topics:[...new Set(d.source.topics)],status:'NORMALIZED'};if(!validators.source(sourceRecord)||!validators.candidate(candidate))throw Error('invalid_candidate');return {json:{sourceRecord,candidate,correlationId:d.correlationId}};`,
);
node('Process candidates sequentially', 'n8n-nodes-base.splitInBatches', 3, {
  batchSize: 1,
  options: {},
});
const persistence =
  old.get('Persist candidate bundle atomically') ??
  old.get('Persist ContentCandidate idempotently');
const table = persistence.parameters.dataTableId;
node(
  'Find URL or hash duplicate',
  'n8n-nodes-base.dataTable',
  1.1,
  {
    resource: 'row',
    operation: 'get',
    dataTableId: table,
    matchType: 'anyCondition',
    filters: {
      conditions: [
        {
          keyName: 'canonicalUrl',
          condition: 'eq',
          keyValue: '={{ $json.candidate.canonicalUrl }}',
        },
        {
          keyName: 'contentHash',
          condition: 'eq',
          keyValue: '={{ $json.candidate.contentHash }}',
        },
      ],
    },
    returnAll: false,
    limit: 1,
  },
  { alwaysOutputData: true, onError: 'continueRegularOutput' },
);
code(
  'Check duplicate lookup succeeded',
  `if($json.error)throw Error('lookup_failed');return {json:$json};`,
);
branch('Candidate already exists', '={{ Boolean($json.candidateId) }}');
code(
  'Report duplicate',
  `return {json:{candidateId:$json.candidateId,outcome:'duplicate',correlationId:'wf01-'+$execution.id}};`,
);
// CAR-167: the scorer previously ran through the langchain chainLlm +
// lmChatOpenRouter + outputParserStructured sub-graph. That SDK path could not
// return within the 30s SLO. This replaces it with a direct native HTTP
// Request call to the same OpenRouter endpoint, same model, same existing
// credential, reasoning capped to "low" and bounded output tokens, so the
// bound is enforced by the node's own timeout instead of an SDK retry policy.
// The node name is preserved: the deterministic harness and downstream
// connections address it by name.
//
// CAR-184: once a DEV export already reflects the CAR-167 httpRequest
// scorer, the old lmChatOpenRouter node no longer exists to read the model
// id/credential from. Recover them from whichever shape the live export is
// currently in, so this generator stays idempotent to run again.
const legacyModelNode = old.get(
  'OpenRouter scorer model (manual credential bind)',
);
const liveScorerNode = old.get('Score candidate with native LLM');
let scorerModelId, scorerCredential;
if (legacyModelNode) {
  scorerModelId = legacyModelNode.parameters.model;
  scorerCredential = legacyModelNode.credentials.openRouterApi;
} else if (liveScorerNode?.type === 'n8n-nodes-base.httpRequest') {
  scorerCredential = liveScorerNode.credentials.openRouterApi;
  // jsonBody stores the unevaluated `={{ JSON.stringify({model: "...", ...}) }}`
  // source expression, so the object key here is unquoted JS, not JSON.
  const match = liveScorerNode.parameters.jsonBody.match(/model:\s*"([^"]+)"/);
  if (!match) throw Error('cannot_recover_scorer_model_id_from_live_export');
  scorerModelId = match[1];
} else {
  throw Error('scorer_source_node_not_found_in_live_export');
}
const SCORER_REASONING_EFFORT = 'low';
const SCORER_MAX_TOKENS = 2000;
const SCORER_TIMEOUT_MS = 30000;
const SCORER_RETRY_COUNT = 0;
// CAR-184/CAR-167A: the langchain outputParserStructured node this HTTP
// Request replaced (see CAR-167 above) used to inject the output schema into
// the model call automatically via its ai_outputParser connection. The
// direct HTTP path never did — response_format stayed {type:"json_object"}
// (generic JSON mode) and the contract was described only in prose, which
// CAR-167's live evidence showed the model does not reliably follow. Per
// OpenRouter's documented structured-outputs feature
// (https://openrouter.ai/docs/features/structured-outputs), enforcement is a
// provider/model capability advertised as "structured_outputs" in that
// model's supported_parameters; deepseek/deepseek-v4-flash-0731 only lists
// "response_format" there, not "structured_outputs", so a machine-enforced
// response_format:{type:"json_schema",...} is not a documented capability of
// this model/provider pair and could turn a lenient mismatch into a hard
// request error instead. So the exact schema is serialized into the request
// instructions instead (the schema/request path this ticket allows when
// enforcement isn't supported), read from the same parsed
// schemas/content-score.schema.json used to validate the response below, so
// there is exactly one schema authority.
// CAR-191: CAR-189's bounded read-only review of n8n 2.35.7 found no proven
// native mechanism that aborts this in-flight authenticated HTTP Request at
// exactly 30s (options.timeout only bounds time-to-first-response-byte; the
// live-catalog run documented in CAR-167-scorer-http-request.md returned
// successfully after 56604ms despite timeout:30000). Since the request
// itself cannot be reliably terminated, this adds a fail-closed
// result-authority/admission fence instead: a response evaluated at or after
// start+30000ms is never treated as authoritative, even if the underlying
// HTTP call did return. It does not change the HTTP node's own timeout,
// retries, model, or reasoning effort, and it does not claim to bound total
// wall-clock execution time.
node('Record scorer start time', 'n8n-nodes-base.set', 3.5, {
  mode: 'raw',
  jsonOutput:
    '={{ JSON.stringify({...$json, scorerStartedAtMs: $now.toMillis()}) }}',
  options: {},
});
const scorerOutputSchema = schemaSources['content-score'];
const scorerSystemPrompt =
  prompt +
  '\nCopy candidateId exactly from untrustedCandidate.id. Return only JSON. No tools or actions.' +
  '\nThe JSON you return must validate exactly against this JSON Schema. Do not add, omit, or rename any property, and do not wrap it in another object:\n' +
  JSON.stringify(scorerOutputSchema);
// CAR-197: CAR-184 embedded scorerSystemPrompt (which contains the
// content-score schema, itself serialized with JSON.stringify) directly as
// literal text inside the httpRequest node's `={{ ... }}` jsonBody
// expression. JSON.stringify does not escape "{"/"}", so any nested-object
// close in the schema (e.g. the end of "properties": {...}) can appear as a
// literal "}}" inside that expression's source text before its real closing
// delimiter, which n8n's expression parser reads as premature termination
// ("invalid syntax"). The scorer's own 12-case deterministic matrix never
// caught this because those cases pin the node's output and never evaluate
// its jsonBody expression at all.
// Fix: build the request body as a plain JS object in a Code node instead.
// A Code node's jsCode field is executed as ordinary JavaScript, not scanned
// for `{{ }}` delimiters, so splicing serialized JSON into it is safe (this
// file already does exactly that elsewhere, e.g. "Validate score and apply
// fixed threshold" below). The httpRequest node then only needs a short,
// fixed expression that can never contain an embedded "}}":
// `={{ JSON.stringify($json.scorerRequestBody) }}`. Nothing about the
// schema/prompt content, model, credential, reasoning effort, token bound,
// or CAR-191 admission fence changes.
code(
  'Build scorer request body',
  `const candidate=$('Process candidates sequentially').item.json.candidate;const body={model:${JSON.stringify(scorerModelId)},temperature:0,max_tokens:${SCORER_MAX_TOKENS},response_format:{type:'json_object'},reasoning:{effort:${JSON.stringify(SCORER_REASONING_EFFORT)}},messages:[{role:'system',content:${JSON.stringify(scorerSystemPrompt)}},{role:'user',content:JSON.stringify({policy:${JSON.stringify(policy)},brandContext:'No brand context supplied; score conservatively and describe missing evidence.',untrustedCandidate:candidate})}]};return {json:{...$json,scorerRequestBody:body}};`,
);
node(
  'Score candidate with native LLM',
  'n8n-nodes-base.httpRequest',
  4.5,
  {
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'openRouterApi',
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.scorerRequestBody) }}',
    options: {
      timeout: SCORER_TIMEOUT_MS,
      redirect: { redirect: { followRedirects: false } },
      response: {
        response: {
          fullResponse: false,
          neverError: false,
          responseFormat: 'json',
        },
      },
    },
  },
  {
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: scorerCredential },
  },
);
const SCORER_ADMISSION_WINDOW_MS = 30000;
numericBranch(
  'Scorer result still within admission window',
  "={{ $now.toMillis() - $('Record scorer start time').item.json.scorerStartedAtMs }}",
  SCORER_ADMISSION_WINDOW_MS,
  'lt',
);
node(
  'Parse OpenRouter scorer response',
  'n8n-nodes-base.set',
  3.5,
  {
    mode: 'raw',
    jsonOutput:
      '={{ JSON.stringify({output: JSON.parse($json.choices[0].message.content)}) }}',
    options: {},
  },
  { onError: 'continueErrorOutput' },
);
code(
  'Validate score and apply fixed threshold',
  `${validation}\nconst upstream=$('Process candidates sequentially').item.json;const score=$json.output;if(!validators.score(score)||score.candidateId!==upstream.candidate.id)throw Error('invalid_score');const candidate={...upstream.candidate,status:score.relevanceScore>=${policy.minimum_relevance_score}?'SELECTED':'SCORED'};if(!validators.candidate(candidate))throw Error('invalid_candidate');return {json:{...upstream,candidate,score,provenance:{contractVersion:1,correlationId:upstream.correlationId,model:${JSON.stringify(scorerModelId)},scorerImplementation:'http_request',reasoningEffort:${JSON.stringify(SCORER_REASONING_EFFORT)},maxTokens:${SCORER_MAX_TOKENS},timeoutSeconds:${SCORER_TIMEOUT_MS / 1000},retryCount:${SCORER_RETRY_COUNT},promptVersion:${JSON.stringify(hash(prompt))},policyVersion:${policy.version},policyHash:${JSON.stringify(hash(JSON.stringify(policy)))},brandContextHash:${JSON.stringify(hash('No brand context supplied; score conservatively and describe missing evidence.'))},generatedAt:new Date().toISOString()}}};`,
);
const columns = structuredClone(persistence.parameters.columns);
for (const [field, key] of Object.entries({
  source_object: 'sourceRecord',
  candidate_object: 'candidate',
  score_object: 'score',
  provenance_object: 'provenance',
})) {
  columns.value[field] = `={{ JSON.stringify($json.${key}) }}`;
  if (!columns.schema.some((c) => c.id === field))
    columns.schema.push({
      id: field,
      displayName: field,
      type: 'string',
      display: true,
      required: false,
      defaultMatch: false,
      canBeUsedToMatch: false,
    });
}
node(
  'Persist candidate bundle atomically',
  'n8n-nodes-base.dataTable',
  1.1,
  {
    resource: 'row',
    operation: 'insert',
    dataTableId: table,
    columns,
    options: {},
  },
  { onError: 'continueErrorOutput' },
);
code(
  'Report persisted candidate',
  `if(!$json.candidateId||!$json.candidate_object||!$json.score_object)throw Error('persistence_unconfirmed');return {json:{candidateId:$json.candidateId,outcome:'persisted',status:$json.status,correlationId:'wf01-'+$execution.id}};`,
);
code(
  'Report candidate failure',
  `return {json:{outcome:'failed',failureCategory:'workflow_step_failed',correlationId:'wf01-'+$execution.id}};`,
);
code(
  'Report source failure',
  `return {json:{outcome:'failed',failureCategory:['rate_limited','upstream_failed','timeout_or_network','invalid_retry_after','invalid_item'].includes($json.sourceError??$json.failureCategory)?($json.sourceError??$json.failureCategory):'invalid_source',correlationId:'wf01-'+$execution.id}};`,
);
code(
  'Summarize candidate outcomes',
  `const rows=$input.all().map(x=>x.json);return [{json:{environment:'development',correlationId:'wf01-'+$execution.id,processed:rows.length,persisted:rows.filter(x=>x.outcome==='persisted').length,duplicate:rows.filter(x=>x.outcome==='duplicate').length,failed:rows.filter(x=>x.outcome==='failed').length,candidateIds:rows.filter(x=>x.candidateId).map(x=>x.candidateId)}}];`,
  'runOnceForAllItems',
);
const connections = {};
function link(a, b, output = 0, type = 'main') {
  connections[a] ??= {};
  connections[a][type] ??= [];
  while (connections[a][type].length <= output) connections[a][type].push([]);
  connections[a][type][output].push({ node: b, type, index: 0 });
}
const chain = (...names) => names.slice(1).forEach((n, i) => link(names[i], n));
chain(
  'Manual DEV test trigger',
  'Create bounded DEV run context',
  'Expand enabled sources',
  'Process sources sequentially',
);
link('Process sources sequentially', 'Prepare bounded request', 1);
chain(
  'Prepare bounded request',
  'Fetch bounded public RSS source',
  'Classify fetch result',
  'Retry transient source',
);
chain(
  'Retry transient source',
  'Respect retry delay',
  'Prepare bounded request',
);
link('Retry transient source', 'Process sources sequentially', 1);
chain(
  'Process sources sequentially',
  'Keep successful sources',
  'Bound RSS payload',
  'Parse RSS XML safely',
  'Normalize untrusted RSS entries',
  'Keep schema-candidate normalized entries',
  'SHA-256 canonical URL',
  'SHA-256 normalized content',
  'Validate discovery contracts',
  'Process candidates sequentially',
);
link('Keep successful sources', 'Report source failure', 1);
link('Keep schema-candidate normalized entries', 'Report source failure', 1);
link('Process candidates sequentially', 'Find URL or hash duplicate', 1);
chain(
  'Find URL or hash duplicate',
  'Check duplicate lookup succeeded',
  'Candidate already exists',
  'Report duplicate',
  'Process candidates sequentially',
);
link('Candidate already exists', 'Record scorer start time', 1);
chain(
  'Record scorer start time',
  'Build scorer request body',
  'Score candidate with native LLM',
);
chain(
  'Score candidate with native LLM',
  'Scorer result still within admission window',
  'Parse OpenRouter scorer response',
  'Validate score and apply fixed threshold',
  'Persist candidate bundle atomically',
  'Report persisted candidate',
  'Process candidates sequentially',
);
link(
  'Scorer result still within admission window',
  'Report candidate failure',
  1,
);
link('Process candidates sequentially', 'Summarize candidate outcomes');
link('Report candidate failure', 'Process candidates sequentially');
link('Report persisted candidate', 'Report candidate failure', 1);
for (const n of nodes.filter(
  (n) => n.onError === 'continueErrorOutput' && !n.name.startsWith('Report'),
)) {
  link(
    n.name,
    [
      'Check duplicate lookup succeeded',
      'Find URL or hash duplicate',
      'Build scorer request body',
      'Score candidate with native LLM',
      'Parse OpenRouter scorer response',
      'Validate score and apply fixed threshold',
      'Persist candidate bundle atomically',
    ].includes(n.name)
      ? 'Report candidate failure'
      : 'Report source failure',
    1,
  );
}
w.nodes = nodes;
w.connections = connections;
w.pinData = {};
w.active = false;
w.activeVersionId = null;
w.settings = {
  ...w.settings,
  executionTimeout: 900,
  saveDataSuccessExecution: 'all',
  saveDataErrorExecution: 'all',
  saveManualExecutions: true,
};
await fs.writeFile(target, JSON.stringify([w]), { mode: 0o600 });
console.log(
  JSON.stringify({
    workflowId: w.id,
    nodes: nodes.length,
    typesVerified: true,
  }),
);
