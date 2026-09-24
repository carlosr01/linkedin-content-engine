import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DiscoveryError, requireValue, validateBundle } from './contracts.mjs';

// Adaptador local reproducible. No selecciona el backend definitivo de n8n DEV.
export class FileCandidateStore {
  constructor(filename) {
    this.filename = filename;
  }

  async read() {
    let raw;
    try {
      raw = await readFile(this.filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new DiscoveryError('storage_failed');
    }
    try {
      const state = JSON.parse(raw);
      requireValue(state.version === 1 && Array.isArray(state.records));
      const urls = new Set();
      const hashes = new Set();
      for (const bundle of state.records) {
        validateBundle(bundle);
        const { canonicalUrl, contentHash } = bundle.candidate;
        requireValue(!urls.has(canonicalUrl) && !hashes.has(contentHash));
        urls.add(canonicalUrl);
        hashes.add(contentHash);
      }
      return state.records;
    } catch {
      throw new DiscoveryError('storage_invalid');
    }
  }

  async find(candidate) {
    return (await this.read()).find(
      (row) =>
        row.candidate.canonicalUrl === candidate.canonicalUrl ||
        row.candidate.contentHash === candidate.contentHash,
    )?.candidate.id;
  }

  async commit(bundle) {
    validateBundle(bundle);
    const lockPath = `${this.filename}.lock`;
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
    let lock;
    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch {
      // Nunca robar un lock: otro proceso puede seguir escribiendo.
      throw new DiscoveryError('storage_busy');
    }
    try {
      const records = await this.read();
      const existing = records.find(
        (row) =>
          row.candidate.canonicalUrl === bundle.candidate.canonicalUrl ||
          row.candidate.contentHash === bundle.candidate.contentHash,
      );
      if (existing)
        return { inserted: false, candidateId: existing.candidate.id };
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ version: 1, records: [...records, bundle] }),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.filename);
      return { inserted: true, candidateId: bundle.candidate.id };
    } catch (error) {
      if (error instanceof DiscoveryError) throw error;
      throw new DiscoveryError('storage_failed');
    } finally {
      await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }
}
