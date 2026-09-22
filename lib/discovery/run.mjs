import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { validateConfig } from '../../scripts/validate-config.mjs';
import {
  canonicalUrl,
  hash,
  DiscoveryError,
  normalize,
  promptVersion,
  requireValue,
  scorerInstructions,
  validateRecord,
} from './contracts.mjs';

export const defaultLimits = Object.freeze({
  maxSources: 5,
  maxPagesPerSource: 2,
  maxItemsPerSource: 25,
  maxItemsPerRun: 25,
  maxAttempts: 3,
  timeoutMs: 30000,
  minIntervalMs: 1000,
  maxBackoffMs: 30000,
});

function limitsFor(overrides) {
  const limits = { ...defaultLimits, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    requireValue(
      key in defaultLimits &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= defaultLimits[key],
      'invalid_limits',
    );
  }
  return limits;
}

async function timedCall(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DiscoveryError('timeout', { retryable: true }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function retry(operation, limits, wait) {
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt++) {
    try {
      return await timedCall(operation, limits.timeoutMs);
    } catch (error) {
      if (
        !(error instanceof DiscoveryError) ||
        !error.retryable ||
        attempt === limits.maxAttempts
      )
        throw error;
      const requested = error.retryAfterMs;
      requireValue(
        Number.isFinite(requested) && requested >= 0,
        'invalid_retry_after',
      );
      // No acortar Retry-After: se difiere la fuente si excede el presupuesto.
      if (requested > limits.maxBackoffMs)
        throw new DiscoveryError('rate_limit_deferred');
      await wait(
        Math.max(
          requested,
          Math.min(
            limits.maxBackoffMs,
            limits.minIntervalMs * 2 ** (attempt - 1),
          ),
        ),
      );
    }
  }
}

const safeCodes = new Set([
  'invalid_input',
  'invalid_url',
  'invalid_output',
  'invalid_page',
  'timeout',
  'rate_limited',
  'rate_limit_deferred',
  'invalid_retry_after',
  'upstream_failed',
  'storage_busy',
  'storage_failed',
  'storage_invalid',
]);

export async function runDiscovery({
  environment,
  catalog,
  policy,
  brandContext,
  model,
  store,
  fetchPage,
  score,
  limits: overrides = {},
  correlationId = randomUUID(),
  now = () => new Date(),
  wait = sleep,
}) {
  requireValue(environment === 'development', 'dev_only');
  validateConfig('sources.example.yaml', catalog);
  validateConfig('content-policy.example.yaml', policy);
  requireValue(typeof model === 'string' && model.length > 0);
  requireValue(
    typeof brandContext === 'string' &&
      brandContext.length > 0 &&
      brandContext.length <= 20000,
  );
  requireValue(typeof correlationId === 'string' && correlationId.length > 0);
  const limits = limitsFor(overrides);
  // Copias evitan que un adaptador altere las reglas a través de referencias.
  const trustedPolicy = structuredClone(policy);
  const sources = structuredClone(catalog.sources)
    .filter((source) => source.enabled && source.type !== 'manual_url')
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, limits.maxSources);
  const report = {
    contractVersion: 1,
    correlationId,
    environment,
    candidateIds: [],
    sources: [],
  };
  let processed = 0;
  const recordError = (summary, stage, error) => {
    summary.failed++;
    summary.errors.push({
      stage,
      code:
        error instanceof DiscoveryError && safeCodes.has(error.code)
          ? error.code
          : 'operation_failed',
      retryable: error instanceof DiscoveryError && error.retryable === true,
      message: 'No se pudo completar esta etapa de WF01.',
      correlationId,
    });
  };
  for (const source of sources) {
    if (processed >= limits.maxItemsPerRun) break;
    const summary = {
      sourceId: source.id,
      discovered: 0,
      duplicate: 0,
      scored: 0,
      selected: 0,
      failed: 0,
      errors: [],
    };
    report.sources.push(summary);
    let cursor = null;
    const cursors = new Set();
    try {
      canonicalUrl(source.url);
      for (
        let pageIndex = 0;
        pageIndex < limits.maxPagesPerSource;
        pageIndex++
      ) {
        if (
          processed >= limits.maxItemsPerRun ||
          summary.discovered >= limits.maxItemsPerSource
        )
          break;
        await wait(limits.minIntervalMs);
        const remaining = Math.min(
          limits.maxItemsPerSource - summary.discovered,
          limits.maxItemsPerRun - processed,
        );
        const page = await retry(
          (signal) =>
            fetchPage({
              source: structuredClone(source),
              cursor,
              limit: remaining,
              signal,
            }),
          limits,
          wait,
        );
        requireValue(
          page &&
            Array.isArray(page.items) &&
            page.items.length <= remaining &&
            (page.nextCursor == null ||
              (typeof page.nextCursor === 'string' &&
                page.nextCursor.length > 0 &&
                page.nextCursor.length <= 2048)),
          'invalid_page',
        );
        for (const item of page.items) {
          processed++;
          summary.discovered++;
          let stage = 'normalize';
          try {
            const occurredAt = now().toISOString();
            const bundle = normalize(source, item, occurredAt);
            stage = 'deduplicate';
            const existing = await store.find(bundle.candidate);
            if (existing) {
              summary.duplicate++;
              report.candidateIds.push(existing);
              continue;
            }
            stage = 'score';
            await wait(limits.minIntervalMs);
            const output = await retry(
              (signal) =>
                score({
                  model,
                  signal,
                  messages: [
                    { role: 'system', content: scorerInstructions },
                    {
                      role: 'user',
                      content: JSON.stringify({
                        policy: trustedPolicy,
                        brandContext,
                        untrustedCandidate: bundle.candidate,
                      }),
                    },
                  ],
                }),
              limits,
              wait,
            );
            // JSON estricto; sin fences, coerción, reparación ni campos de autoridad.
            requireValue(
              typeof output !== 'string' || output.length <= 16384,
              'invalid_output',
            );
            let evaluation;
            try {
              evaluation =
                typeof output === 'string'
                  ? JSON.parse(output)
                  : structuredClone(output);
            } catch {
              throw new DiscoveryError('invalid_output');
            }
            validateRecord('content-score', evaluation);
            requireValue(
              evaluation.candidateId === bundle.candidate.id,
              'invalid_output',
            );
            bundle.score = evaluation;
            bundle.candidate.status =
              evaluation.relevanceScore >= trustedPolicy.minimum_relevance_score
                ? 'SELECTED'
                : 'SCORED';
            bundle.provenance = {
              contractVersion: 1,
              correlationId,
              model,
              promptVersion,
              policyVersion: trustedPolicy.version,
              policyHash: hash(JSON.stringify(trustedPolicy)),
              brandContextHash: hash(brandContext),
              generatedAt: now().toISOString(),
            };
            stage = 'persist';
            const result = await store.commit(bundle);
            report.candidateIds.push(result.candidateId);
            if (!result.inserted) summary.duplicate++;
            else {
              summary.scored++;
              if (bundle.candidate.status === 'SELECTED') summary.selected++;
            }
          } catch (error) {
            recordError(summary, stage, error);
          }
        }
        if (page.nextCursor == null) break;
        requireValue(!cursors.has(page.nextCursor), 'invalid_page');
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
    } catch (error) {
      recordError(summary, 'fetch', error);
    }
  }
  report.candidateIds = [...new Set(report.candidateIds)];
  report.status = report.sources.some((source) => source.failed > 0)
    ? 'partial_failure'
    : 'success';
  return report;
}
