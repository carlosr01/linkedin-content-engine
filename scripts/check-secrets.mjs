import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'reports',
]);
const excludedFiles = new Set(['.env.example']);
const binaryExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
]);

const detectors = [
  {
    name: 'private key header',
    pattern: /-----BEGIN(?: RSA| EC| OPENSSH| DSA)? PRIVATE KEY-----/,
  },
  {
    name: 'GitHub token',
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/,
  },
  {
    name: 'bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*\b/i,
  },
  {
    name: 'Telegram bot token',
    pattern: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/,
  },
  {
    name: 'hardcoded integration secret',
    pattern:
      /\b(?:OPENAI_API_KEY|TELEGRAM_BOT_TOKEN|LINKEDIN_CLIENT_SECRET)\s*[:=]\s*['"]?([^'"\s,;}]{12,})/i,
  },
];

function mask(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function collectFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target)));
    if (
      entry.isFile() &&
      !excludedFiles.has(entry.name) &&
      !binaryExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(target);
    }
  }
  return files;
}

export async function scanForSecrets(root) {
  const findings = [];
  for (const file of await collectFiles(root)) {
    const buffer = await fs.readFile(file);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString('utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (line.includes('SAFE_TEST_FIXTURE')) continue;
      for (const detector of detectors) {
        const match = line.match(detector.pattern);
        if (match) {
          findings.push({
            file: path.relative(root, file),
            line: index + 1,
            kind: detector.name,
            masked: mask(match[1] ?? match[0]),
          });
        }
      }
    }
  }
  return findings;
}

async function main() {
  const root = path.resolve(process.cwd());
  const findings = await scanForSecrets(root);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        `${finding.file}:${finding.line} ${finding.kind} (${finding.masked})`,
      );
    }
    throw new Error(`${findings.length} potential secret(s) detected`);
  }
  console.log('Secret scan passed (no obvious credential patterns detected).');
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`Secret scan failed: ${error.message}`);
    process.exitCode = 1;
  });
}
