import test from 'node:test';
import assert from 'node:assert/strict';

import { validateConfig } from '../scripts/validate-config.mjs';

const safePolicy = {
  version: 1,
  minimum_relevance_score: 75,
  human_approval_required: true,
  auto_publish: false,
  allow_unsourced_claims: false,
  allow_direct_copy: false,
  default_language: 'es',
  maximum_revision_attempts: 3,
};

test('accepts the safe content policy invariant', () => {
  assert.doesNotThrow(() =>
    validateConfig('content-policy.example.yaml', safePolicy),
  );
});

test('rejects auto-publish and disabled human approval', () => {
  assert.throws(
    () =>
      validateConfig('content-policy.example.yaml', {
        ...safePolicy,
        human_approval_required: false,
        auto_publish: true,
      }),
    /human_approval_required/,
  );
});
