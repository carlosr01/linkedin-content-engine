import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  compileSchemas,
  loadSchemas,
} from '../../scripts/validate-schemas.mjs';

const validator = compileSchemas(
  await loadSchemas(fileURLToPath(new URL('../../schemas/', import.meta.url))),
);
export const scorerInstructions = await readFile(
  new URL('../../prompts/content-scorer.md', import.meta.url),
  'utf8',
);
export const promptVersion = createHash('sha256')
  .update(scorerInstructions)
  .digest('hex');
export const hash = (text) => createHash('sha256').update(text).digest('hex');

export class DiscoveryError extends Error {
  constructor(code, { retryable = false, retryAfterMs = 0 } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export function requireValue(condition, code = 'invalid_input') {
  if (!condition) throw new DiscoveryError(code);
}

export function validateRecord(kind, record) {
  requireValue(
    validator.getSchema(`urn:linkedin-content-engine:schema:${kind}`)(record),
    'invalid_output',
  );
  return record;
}

export function canonicalUrl(value) {
  requireValue(typeof value === 'string' && value.length <= 4096);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DiscoveryError('invalid_url');
  }
  requireValue(
    ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password,
    'invalid_url',
  );
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  // El orden, los parámetros funcionales, el path y HTTP/HTTPS conservan semántica.
  return url.href;
}

function text(value, maximum) {
  requireValue(typeof value === 'string' && value.length <= maximum);
  const result = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  requireValue(result.length > 0);
  return result;
}

export function normalize(source, item, occurredAt) {
  requireValue(item && typeof item === 'object' && !Array.isArray(item));
  const url = canonicalUrl(item.url);
  const title = text(item.title, 2000);
  const extractedText = text(item.text, 100000);
  const contentHash = hash(JSON.stringify([title, extractedText]));
  const sourceId = `source-${hash(url)}`;
  const id = `candidate-${hash(url)}`;
  const language = source.language === 'auto' ? item.language : source.language;
  // Fecha ausente permanece null. Una fecha presente inválida rechaza el item.
  let publishedAt = item.publishedAt ?? null;
  if (publishedAt !== null) {
    requireValue(
      typeof publishedAt === 'string' &&
        validator.validate(
          { type: 'string', format: 'date-time' },
          publishedAt,
        ),
    );
    publishedAt = new Date(publishedAt).toISOString();
  }
  const author = item.author == null ? null : text(item.author, 500);
  const record = validateRecord('source-record', {
    id: sourceId,
    name: source.name,
    type: source.type,
    originalUrl: item.url,
    canonicalUrl: url,
    title,
    author,
    publishedAt,
    retrievedAt: occurredAt,
    language,
    contentHash,
    extractedText,
  });
  const candidate = validateRecord('content-candidate', {
    id,
    sourceId,
    sourceType: source.type,
    sourceUrl: item.url,
    sourceTitle: title,
    sourceAuthor: author,
    sourcePublishedAt: publishedAt,
    discoveredAt: occurredAt,
    rawSummary: extractedText,
    canonicalUrl: url,
    contentHash,
    language,
    topics: [...new Set(source.topics)],
    status: 'NORMALIZED',
  });
  return { source: record, candidate };
}

export function validateBundle(bundle) {
  validateRecord('source-record', bundle.source);
  validateRecord('content-candidate', bundle.candidate);
  validateRecord('content-score', bundle.score);
  const { candidate, source, score, provenance } = bundle;
  requireValue(
    ['SCORED', 'SELECTED'].includes(candidate.status) &&
      candidate.sourceId === source.id &&
      candidate.id === score.candidateId &&
      candidate.canonicalUrl === source.canonicalUrl &&
      candidate.contentHash === source.contentHash &&
      provenance?.contractVersion === 1 &&
      typeof provenance.model === 'string' &&
      provenance.model.length > 0 &&
      typeof provenance.promptVersion === 'string' &&
      /^[a-f0-9]{64}$/.test(provenance.promptVersion) &&
      typeof provenance.correlationId === 'string' &&
      provenance.correlationId.length > 0,
    'invalid_output',
  );
}
