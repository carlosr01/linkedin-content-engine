# Roadmap

Each phase must preserve source grounding, schema validation, explicit human approval, idempotency, DEV/PROD separation, and least privilege. A later phase begins only when the preceding contracts and safety gates have evidence.

## Phase 0 — Foundation (current)

- Private GitHub repository and trunk-based workflow.
- Product, architecture, data, security, and operating contracts.
- JSON Schemas, prompt contracts, example configuration, validation, tests, and CI.
- No runtime connections or workflow exports.

**Exit:** clean bootstrap commit passes CI; repository is private and verified.

## Phase 1 — DEV environment

- Install and load official n8n skills.
- Connect Codex only to n8n DEV through an appropriately scoped MCP.
- Verify current node/tool capabilities and environment identity.
- Establish safe workflow export/import and credential boundaries.

**Exit:** read/write connectivity is proven in DEV without exposing or modifying PROD.

## Phase 2 — Discovery

- Implement WF01 source ingestion, normalization, deduplication, scoring, persistence, and failure isolation.
- Validate with representative sources and bounded runs.

## Phase 3 — Manual references

- Implement WF02 authorized Telegram URL ingestion.
- Cover replay, invalid URL, unreachable source, duplicates, and prompt-injection content.

## Phase 4 — Editorial engine

- Implement WF03 brand-context retrieval, structured drafting, quality critique, and fact review.
- Establish prompt/version evaluation fixtures before tuning.

## Phase 5 — Human approval and publishing

- Implement WF04 review, revision, rejection, exact-version approval, idempotent LinkedIn publishing, and audit.
- Demonstrate that invalid and stale approvals cannot publish.

## Phase 6 — Analytics

- Implement WF05 permitted metric retrieval and normalization.
- Relate evidence to topic, format, and editorial decisions without automatic policy changes.

## Phase 7 — Optimization

- Improve scoring, prompts, source mix, cost, and content performance using measured evidence.
- Document threshold changes as product decisions.

Multi-platform publishing remains out of scope until V1 proves useful and reliable.
