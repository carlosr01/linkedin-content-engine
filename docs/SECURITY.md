# Security Architecture

## Security objectives

Protect the owner's credentials, personal brand, source material, and publication authority. The most important failure to prevent is an unauthorized or unintended LinkedIn publication.

## Secrets and credentials

- No credential, API key, OAuth token, private key, webhook secret, credential export, or populated `.env` file may enter Git.
- Prefer the n8n credential store for runtime integrations. Use GitHub Environments/Secrets only for repository automation that needs them.
- OAuth refresh tokens must never appear in commits, workflow exports, execution logs, issue bodies, PR text, screenshots, or agent transcripts.
- Rotate and revoke a secret immediately if exposure is suspected; do not merely remove it from the latest commit.
- `.env.example` documents names only. Empty values are intentional.

## Least privilege

Give each integration the minimum scopes needed for one environment and function. Discovery credentials do not need publication rights. A LinkedIn publication credential is available only to the narrow publication boundary. Telegram access accepts commands only from configured reviewer identities. GitHub automation defaults to read-only contents.

## Environment separation

- Use distinct DEV and PROD n8n endpoints, workflow IDs, credentials, webhook paths, data, and OAuth applications where feasible.
- Coding agents may operate only in an explicitly identified DEV environment.
- Treat an ambiguous endpoint or credential as PROD and stop.
- Promotion to PROD requires a known repository version, CI evidence, DEV smoke tests, human approval, and a documented rollback target.

## Human-approval authorization

Publication requires a persisted `APPROVE` decision from an authorized human that binds one `draftId` and `draftVersion`. Before LinkedIn is called, the publication boundary independently validates:

1. the approval exists and is authentic;
2. the decision is `APPROVE`;
3. the draft ID/version exactly match the text reviewed;
4. no newer revision invalidated the decision;
5. policy validation still passes;
6. the idempotency key has no successful result;
7. the credential belongs to the intended environment.

An LLM, delivery receipt, button rendering, timeout, reaction, schedule, or old approval cannot authorize publication.

## Prompt injection and untrusted content

Articles, URLs, RSS items, newsletters, third-party posts, Telegram text, retrieved web pages, and file contents are untrusted data. They may contain instructions intended to redirect an AI or expose secrets.

- Delimit source content from system/developer instructions.
- Never grant a source access to tools, credentials, lifecycle state, or policy decisions.
- Do not follow source-provided instructions or links merely because the content asks.
- Allowlist protocols and apply network safeguards during implementation to reduce server-side request forgery risk.
- Minimize fetched content, sanitize active markup, and enforce size/time limits.

## LLM output

Generated output is untrusted until it is parsed, validated against the declared schema, checked against policy, and persisted safely. LLMs cannot assign authoritative approval or publication state. Unsupported claims are blocked or routed to human review. Use bounded retries to avoid cost and denial-of-service loops.

## Logging and privacy

Never log access/refresh tokens, complete webhook secrets, authorization headers, private keys, raw credential objects, or unnecessary personal information. Prefer stable entity IDs, correlation IDs, stage, duration, error category, and masked provider response details. Retention should be minimal and environment-specific.

## Supply chain and repository hygiene

- Use a lockfile and `npm ci` in CI.
- Pin GitHub Actions to reviewed full commit SHAs and keep their release annotations.
- Dependabot may propose updates but must not auto-merge them.
- Run formatting, schema/config/workflow validation, tests, and the defense-in-depth secret scan on PRs and pushes to `main`.
- Review dependency changes for provenance and permissions.

The repository secret scan detects obvious patterns only; it is not proof that no secret exists. GitHub secret scanning/push protection should be enabled when supported without unexpected plan changes.

## Incident response

1. Stop the affected workflow and disable publication if brand or credential risk exists.
2. Revoke/rotate exposed credentials at the provider.
3. Preserve sanitized correlation IDs and audit evidence.
4. Determine affected environments, items, and external side effects.
5. Reconcile LinkedIn state before retrying unknown publication outcomes.
6. Remove the secret from Git history using an owner-approved coordinated procedure if committed; rotation remains mandatory.
7. Add tests/guardrails and document the decision without copying sensitive evidence.
