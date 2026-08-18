import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanForSecrets } from '../scripts/check-secrets.mjs';

test('detects and masks an obvious GitHub-token-shaped value', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'secret-scan-'));
  const token = ['ghp_', 'a'.repeat(36)].join('');
  try {
    await fs.writeFile(
      path.join(directory, 'unsafe.txt'),
      `token=${token}\n`,
      'utf8',
    );
    const findings = await scanForSecrets(directory);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'GitHub token');
    assert.equal(findings[0].masked.includes(token), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
