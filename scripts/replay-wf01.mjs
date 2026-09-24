import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { runDiscovery } from '../lib/discovery/run.mjs';
import { FileCandidateStore } from '../lib/discovery/store.mjs';

// Sólo fixtures: no HTTP, credenciales, modelo remoto ni instancia n8n.
const directory = await mkdtemp(join(tmpdir(), 'wf01-replay-'));
try {
  const policy = parse(
    await readFile(
      new URL('../config/content-policy.example.yaml', import.meta.url),
      'utf8',
    ),
  );
  const filename = join(directory, 'candidates.json');
  const args = {
    environment: 'development',
    correlationId: 'wf01-offline-replay',
    catalog: {
      version: 1,
      sources: [
        {
          id: 'synthetic-rss',
          name: 'Fixture local',
          type: 'rss',
          enabled: true,
          url: 'https://example.com/feed',
          priority: 80,
          topics: ['automation'],
          language: 'es',
        },
      ],
    },
    policy,
    model: 'fixture-scorer-v1',
    brandContext: 'Contexto sintético de pruebas.',
    wait: async () => {},
    now: () => new Date('2026-09-22T00:00:00.000Z'),
    fetchPage: async () => ({
      items: [
        {
          url: 'https://example.com/article',
          title: 'Fixture',
          text: 'Texto sintético.',
        },
      ],
    }),
    score: async ({ messages }) => ({
      candidateId: JSON.parse(messages[1].content).untrustedCandidate.id,
      relevanceScore: 80,
      brandAlignment: 70,
      audienceValue: 70,
      novelty: 60,
      authority: 50,
      opinionPotential: 80,
      recommended: true,
      reason: 'Fixture; no representa una evaluación editorial.',
      contentPillar: 'automation',
      recommendedFormat: 'insight',
    }),
  };
  const first = await runDiscovery({
    ...args,
    store: new FileCandidateStore(filename),
  });
  const replay = await runDiscovery({
    ...args,
    store: new FileCandidateStore(filename),
  });
  if (first.sources[0].scored !== 1 || replay.sources[0].duplicate !== 1)
    throw new Error('replay_failed');
  console.log(
    JSON.stringify(
      { mode: 'OFFLINE_FIXTURES_ONLY', liveDevVerified: false, first, replay },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
