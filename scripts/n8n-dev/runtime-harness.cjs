/* Ejecutar sólo dentro del contenedor n8n DEV existente. Sin secretos en argumentos.
   node runtime-harness.cjs prepare-store|test WORKFLOW_ID OUTPUT_JSON [CASE]
   N8N_RUNNERS_BROKER_PORT distinto sólo para este proceso de pruebas. */
const root = '/usr/local/lib/node_modules/n8n';
const r = require('node:module').createRequire(root + '/package.json');
r('reflect-metadata');
r(root + '/dist/config');
const { Container } = r('@n8n/di');
const { Execute } = r(root + '/dist/commands/execute');
const { WorkflowRepository } = r('@n8n/db');
const { WorkflowRunner } = r(root + '/dist/workflow-runner');
const { ActiveExecutions } = r(root + '/dist/active-executions');
const { OwnershipService } = r(root + '/dist/services/ownership.service');
const fs = require('node:fs');
const http = require('node:http');
const { createHash } = require('node:crypto');
const [mode, workflowId, outputPath, onlyCase] = process.argv.slice(2);
const hash = (x) => createHash('sha256').update(x).digest('hex');
function ensure(c, m) {
  if (!c) throw Error(m);
}
(async () => {
  ensure(
    process.env.N8N_HOST === 'n8n-dev.innovaq-ai.com',
    'DEV_HOST_REQUIRED',
  );
  await Container.get(r('@n8n/backend-common').ModuleRegistry).loadModules();
  const cmd = new Execute();
  await cmd.init();
  Container.get(r('@n8n/backend-common').ModuleRegistry).context.set(
    'data-table',
    await Container.get(
      r(root + '/dist/modules/data-table/data-table.module').DataTableModule,
    ).context(),
  );
  const repo = Container.get(WorkflowRepository);
  const saved = await repo.findOneBy({ id: workflowId });
  ensure(
    saved?.name === 'WF01__content_discovery' &&
      !saved.active &&
      !saved.activeVersionId,
    'INACTIVE_WF01_REQUIRED',
  );
  const owner = await Container.get(OwnershipService).getInstanceOwner();
  const { DataTableService } = r(
    root + '/dist/modules/data-table/data-table.service',
  );
  const service = Container.get(DataTableService);
  const tableId = saved.nodes.find(
    (n) =>
      n.name === 'Persist candidate bundle atomically' ||
      n.name === 'Persist ContentCandidate idempotently',
  ).parameters.dataTableId.value;
  const project = await service.getProjectIdForDataTable(tableId);
  if (mode === 'prepare-store') {
    const columns = await service.getColumns(tableId, project);
    for (const name of [
      'source_object',
      'candidate_object',
      'score_object',
      'provenance_object',
    ])
      if (!columns.some((c) => c.name === name))
        await service.addColumn(tableId, project, { name, type: 'string' });
    const { DataTableColumnRepository } = r(
      root + '/dist/modules/data-table/data-table-column.repository',
    );
    const cr = Container.get(DataTableColumnRepository);
    ensure(/^[a-zA-Z0-9]+$/.test(tableId), 'INVALID_TABLE_ID');
    for (const field of ['canonicalUrl', 'contentHash'])
      await cr.manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS "car48_' +
          field +
          '_unique" ON "data_table_user_' +
          tableId +
          '" ("' +
          field +
          '") WHERE "provenance_object" IS NOT NULL',
      );
    console.log('CAR48_STORE_PREPARED=YES');
    return cmd.exitSuccessFully();
  }
  ensure(mode === 'test', 'UNKNOWN_MODE');
  const namespace = 'car48-' + Date.now();
  const before = await service.getManyRowsAndCount(tableId, project, {
    take: 1000,
    skip: 0,
  });
  const counters = {};
  const times = {};
  let current;
  const baselineUrl = `https://example.com/${namespace}/baseline`;
  const source = {
    id: 'fixture-rss',
    name: 'Fixture CAR-48',
    type: 'rss',
    enabled: true,
    url: '',
    priority: 80,
    topics: ['automation'],
    language: 'es',
  };
  const cases = [
    {
      name: 'valid-source',
      url: baselineUrl,
      title: namespace,
      text: 'Texto base',
      insert: 1,
    },
    {
      name: 'duplicate-url',
      url: baselineUrl + '?utm_source=test',
      title: 'Cambio ' + namespace,
      text: 'Texto diferente',
      insert: 0,
      duplicates: 1,
    },
    {
      name: 'duplicate-hash',
      url: `https://example.com/${namespace}/copy`,
      title: namespace,
      text: 'Texto base',
      insert: 0,
      duplicates: 1,
    },
    {
      name: 'invalid-item',
      title: '',
      text: 'Sin titulo',
      insert: 0,
      sourceFailures: 1,
    },
    { name: '429', insert: 1, attempts: 3 },
    { name: '5xx', insert: 1, attempts: 3 },
    { name: 'timeout', insert: 0, attempts: 3, sourceFailures: 1 },
    { name: 'partial-source-failure', insert: 1, sourceFailures: 1 },
    { name: 'invalid-scorer-output', insert: 0, candidateFailures: 1 },
    { name: 'long-retry-after', insert: 0, attempts: 1, sourceFailures: 1 },
    {
      name: 'atomic-url-conflict',
      url: baselineUrl,
      title: namespace + ' conflict',
      text: 'Conflict',
      insert: 0,
      candidateFailures: 1,
      staleLookup: true,
    },
    {
      name: 'atomic-hash-conflict',
      url: `https://example.com/${namespace}/race`,
      title: namespace,
      text: 'Texto base',
      insert: 0,
      candidateFailures: 1,
      staleLookup: true,
    },
    // CAR-191: result-authority/admission fence. These pin only the
    // recorded scorer start time (never the scorer node's own timeout,
    // retries, or output), backdating it so the admission gate evaluates a
    // deterministic elapsed time against the real $now at execution time.
    // "before" proves the normal accept path is untouched; "at"/"after"
    // prove late results are rejected before parse/validation/persistence,
    // per the accepted "at or after 30000ms" semantics (an elapsed value
    // pinned to exactly the boundary can only ever measure at-or-after it in
    // real execution, since evaluating the gate itself consumes time).
    {
      name: 'admission-before-boundary',
      insert: 1,
      admissionOffsetMs: 5000,
    },
    {
      name: 'admission-at-boundary',
      insert: 0,
      candidateFailures: 1,
      admissionOffsetMs: 30000,
      expectNoParse: true,
    },
    {
      name: 'admission-after-boundary',
      insert: 0,
      candidateFailures: 1,
      admissionOffsetMs: 45000,
      expectNoParse: true,
    },
    { name: 'live-scorer', insert: 1, liveScorer: true },
    { name: 'live-catalog', liveScorer: true, liveCatalog: true },
  ];
  const server = http.createServer((req, res) => {
    const key = req.url;
    counters[key] = (counters[key] ?? 0) + 1;
    (times[key] ??= []).push(Date.now());
    if (current.name === 'timeout') {
      return;
    }
    if (
      key === '/bad' ||
      (['429', '5xx'].includes(current.name) && counters[key] < 3) ||
      current.name === 'long-retry-after'
    ) {
      res.writeHead(
        current.name === '429' || current.name === 'long-retry-after'
          ? 429
          : 503,
        { 'Retry-After': current.name === 'long-retry-after' ? '60' : '1' },
      );
      res.end('fixture');
      return;
    }
    const escape = (s) =>
      s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end(
      `<rss version="2.0"><channel><title>Fixture</title><item><link>${escape(current.url)}</link><title>${escape(current.title)}</title><description>${escape(current.text)}</description></item></channel></rss>`,
    );
  });
  await new Promise((resolve) => server.listen(18848, '127.0.0.1', resolve));
  const evidence = [];
  const debug = [];
  try {
    for (const test of cases.filter(
      (c) =>
        !onlyCase ||
        c.name === onlyCase ||
        (onlyCase === 'matrix' && !c.liveScorer),
    )) {
      current = {
        url: `https://example.com/${namespace}/${test.name}`,
        title: namespace + ' ' + test.name,
        text: 'Texto ' + test.name,
        ...test,
      };
      const w = JSON.parse(JSON.stringify(saved));
      const cfg = w.nodes.find(
        (n) => n.name === 'Create bounded DEV run context',
      );
      const liveConfig = JSON.parse(cfg.parameters.jsonOutput);
      const sources = [
        { ...source, url: 'http://127.0.0.1:18848/' + test.name },
      ];
      if (test.name === 'partial-source-failure')
        sources.unshift({
          ...source,
          id: 'failed-rss',
          url: 'http://127.0.0.1:18848/bad',
        });
      cfg.parameters = {
        mode: 'raw',
        jsonOutput: JSON.stringify({
          environment: 'development',
          maximumCandidatesPerRun: test.liveCatalog ? 1 : 25,
          sources: test.liveCatalog ? liveConfig.sources : sources,
        }),
        options: {},
      };
      if (test.name === 'timeout')
        w.nodes.find(
          (n) => n.name === 'Fetch bounded public RSS source',
        ).parameters.options.timeout = 100;
      const candidateId = 'candidate-' + hash(current.url.split('?')[0]);
      const score = {
        candidateId,
        relevanceScore: 80,
        brandAlignment: 60,
        audienceValue: 60,
        novelty: 50,
        authority: 40,
        opinionPotential: 60,
        recommended: false,
        reason: 'Fixture CAR-48',
        contentPillar: 'automation',
        recommendedFormat: 'insight',
      };
      if (test.name === 'invalid-scorer-output') score.relevanceScore = 101;
      // CAR-167: the scorer node is now a native HTTP Request call to
      // OpenRouter, so the fixture pins the raw provider response shape
      // (choices[0].message.content) at that node. The real downstream
      // "Parse OpenRouter scorer response" node still runs and does the
      // actual JSON.parse, exercising that parsing path in every
      // deterministic case instead of bypassing it.
      const pinData = test.liveScorer
        ? {}
        : {
            'Score candidate with native LLM': [
              {
                json: {
                  id: 'fixture-' + test.name,
                  choices: [{ message: { content: JSON.stringify(score) } }],
                },
              },
            ],
          };
      if (test.staleLookup)
        pinData['Find URL or hash duplicate'] = [{ json: {} }];
      if (!test.liveScorer)
        w.nodes.find(
          (n) => n.name === 'Validate score and apply fixed threshold',
        ).parameters.jsCode = w.nodes
          .find((n) => n.name === 'Validate score and apply fixed threshold')
          .parameters.jsCode.replace(
            /model:"[^"]+"/,
            'model:"fixture-scorer-v1"',
          );
      const prior = await service.getManyRowsAndCount(tableId, project, {
        take: 1000,
        skip: 0,
      });
      if (test.admissionOffsetMs !== undefined)
        pinData['Record scorer start time'] = [
          { json: { scorerStartedAtMs: Date.now() - test.admissionOffsetMs } },
        ];
      const id = await Container.get(WorkflowRunner).run({
        executionMode: 'manual',
        workflowData: w,
        userId: owner.id,
        startNodes: [{ name: 'Manual DEV test trigger', sourceData: null }],
        pinData,
      });
      const result =
        await Container.get(ActiveExecutions).getPostExecutePromise(id);
      const rd = result?.data?.resultData;
      const data = rd?.runData ?? {};
      const rows = (name) =>
        (data[name] ?? [])
          .flatMap((run) => (run.data?.main ?? []).flat())
          .map((x) => x.json);
      const after = await service.getManyRowsAndCount(tableId, project, {
        take: 1000,
        skip: 0,
      });
      const inserted = after.count - prior.count;
      const sourceFailures = rows('Report source failure').length;
      const candidateFailures = rows('Report candidate failure').length;
      const duplicates = rows('Report duplicate').length;
      const attempts = counters['/' + test.name] ?? 0;
      // CAR-167: the >30s acceptance rule is evaluated on the scorer node's
      // OWN executionTime, never on total workflow execution time.
      const scorerRun = (data['Score candidate with native LLM'] ?? [])[0];
      const scorerExecutionTimeMs = scorerRun?.executionTime ?? null;
      const scorerExecutionStatus = scorerRun?.executionStatus ?? null;
      const scorerWithinSlo = test.liveScorer
        ? scorerExecutionTimeMs !== null && scorerExecutionTimeMs <= 30000
        : null;
      // CAR-191: proves late results never reach parsing/validation/
      // persistence — the admission gate sits immediately after the scorer
      // node and before this Set node, so a rejected result leaves it with
      // zero runs for that item.
      const scorerResponseParsedCount = rows(
        'Parse OpenRouter scorer response',
      ).length;
      const passed =
        !rd.error &&
        scorerWithinSlo !== false &&
        (test.liveCatalog
          ? inserted + duplicates === 1
          : inserted === test.insert &&
            duplicates === (test.duplicates ?? 0)) &&
        sourceFailures === (test.sourceFailures ?? 0) &&
        candidateFailures === (test.candidateFailures ?? 0) &&
        (!test.attempts || attempts === test.attempts) &&
        (!test.expectNoParse || scorerResponseParsedCount === 0);
      const record = {
        case: test.name,
        executionId: id,
        status: passed ? 'PASS' : 'FAIL',
        executionStatus: result.status,
        scorerExecutionTimeMs,
        scorerExecutionStatus,
        inserted,
        duplicates,
        sourceFailures,
        candidateFailures,
        scorerResponseParsedCount,
        attempts,
        pinnedNodes: Object.keys(pinData),
        overrides: [
          test.liveCatalog
            ? 'maximumCandidatesPerRun=1'
            : 'trusted fixture source catalog',
          ...(!test.liveScorer ? ['provenance model=fixture-scorer-v1'] : []),
          ...(test.name === 'timeout' ? ['HTTP timeout 100ms'] : []),
        ],
        requestIntervalsMs: (times['/' + test.name] ?? [])
          .slice(1)
          .map((t, i) => t - times['/' + test.name][i]),
      };
      evidence.push(record);
      debug.push({ case: test.name, id, result });
      console.log('CAR48_CASE=' + JSON.stringify(record));
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          {
            workflowId,
            n8nVersion: r(root + '/package.json').version,
            namespace,
            beforeCount: before.count,
            evidence,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      fs.writeFileSync(outputPath + '.private-debug', JSON.stringify(debug), {
        mode: 0o600,
      });
      if (!passed) break;
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const after = await service.getManyRowsAndCount(tableId, project, {
    take: 1000,
    skip: 0,
  });
  const bundles = after.data
    .filter((row) => row.canonicalUrl?.includes(namespace))
    .map((row) => ({
      source: JSON.parse(row.source_object),
      candidate: JSON.parse(row.candidate_object),
      score: JSON.parse(row.score_object),
      provenance: JSON.parse(row.provenance_object),
    }));
  fs.writeFileSync(outputPath + '.bundles', JSON.stringify(bundles), {
    mode: 0o600,
  });
  const reread = await repo.findOneBy({ id: workflowId });
  ensure(!reread.active && !reread.activeVersionId, 'WORKFLOW_ACTIVATED');
  ensure(
    evidence.every((e) => e.status === 'PASS'),
    'DEV_CASE_FAILED',
  );
  await cmd.exitSuccessFully();
})().catch((e) => {
  console.error('CAR48_HARNESS_ERROR=' + e.message);
  process.exit(1);
});
