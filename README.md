# LinkedIn Content Engine

An AI-assisted system that will discover useful material, rank it, create original LinkedIn drafts aligned with a personal brand, request human review through Telegram, and publish **only content that a human explicitly approves**.

> **Current status:** Phase 0 — Repository Bootstrap. The integrations below describe the intended V1 architecture; they are not operational yet.

## Purpose

Maintaining a thoughtful LinkedIn presence involves much more than writing. Sources must be found, noise filtered, facts preserved, ideas adapted to the author's point of view, drafts reviewed, and results tracked. This project turns that work into a controlled editorial pipeline while keeping the final decision with the brand owner.

## Core principle

```text
Sources → Discovery → Scoring → Draft → Human Approval → Publish → Learn
```

The system must never shorten this to an automatic generation-and-publish path. An approval applies to one exact draft version, is auditable, and is required before LinkedIn receives a publication request.

## Intended V1 technology

- **n8n** for modular workflow orchestration
- **OpenAI API** for schema-constrained analysis and drafting
- **Google Drive** for brand and editorial reference material
- **Google Sheets or n8n Data Tables** for simple operational records, selected by evidence during implementation
- **Telegram** for manual URL submission and human review
- **LinkedIn API** for approved publication only
- **GitHub** as the source of truth for workflows, contracts, prompts, tests, and operating rules
- **Hostinger VPS** as the intended n8n runtime host

No integration is connected by this bootstrap.

## Planned workflows

| Workflow                   | Responsibility                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| WF01 Discovery             | Ingest, normalize, deduplicate, score, and persist candidates.                           |
| WF02 Reference Ingestion   | Convert a user-submitted Telegram URL into a grounded candidate.                         |
| WF03 Editorial Engine      | Retrieve brand context, draft, validate, and review quality and facts.                   |
| WF04 Approval & Publishing | Collect revise/reject/approve decisions and publish an explicitly approved version once. |
| WF05 Analytics             | Capture permitted performance data and feed evidence back into ranking.                  |

See [Architecture](docs/ARCHITECTURE.md) and [workflow contracts](docs/N8N_WORKFLOW_CONTRACTS.md) for boundaries and invariants. No workflow JSON is included until it can be created or exported from a live n8n DEV environment and validated there.

## Development model

```text
GitHub → AI coding agent → n8n DEV → validation → PR → approved deployment → PROD
```

AI coding agents may change repository artifacts and an explicitly authorized DEV environment. They may not directly modify PROD, access production credentials, bypass review, or publish LinkedIn content during development.

## Repository structure

| Path         | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| `.github/`   | CI, Dependabot, issue forms, and pull-request policy.              |
| `config/`    | Non-secret, reviewable configuration examples.                     |
| `docs/`      | Product, architecture, security, operations, and decision records. |
| `prompts/`   | Version-controlled contracts for future LLM tasks.                 |
| `schemas/`   | JSON Schemas that constrain data crossing workflow boundaries.     |
| `workflows/` | Future n8n exports, separated by capability.                       |
| `scripts/`   | Small repository-level validators.                                 |
| `tests/`     | Contract fixtures and automated checks.                            |
| `AGENTS.md`  | Mandatory operating rules for coding agents.                       |

## Local setup

Prerequisites: Node.js 22 or newer and npm 10.

```bash
npm install
npm run validate
npm test
```

For CI-equivalent verification:

```bash
npm ci
npm run ci
```

## Working safely

1. Create a short-lived `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...` branch.
2. Update contracts and documentation before or with behavior.
3. Validate locally and test workflow behavior only in n8n DEV.
4. Export verified workflow definitions from n8n; do not fabricate node configuration.
5. Open a pull request and preserve the human-approval invariant.

Read [Contributing](CONTRIBUTING.md), [Development](docs/DEVELOPMENT.md), and [Security](SECURITY.md) before making material changes.

## Security

Never copy `.env`, OAuth tokens, API keys, credential exports, or production data into Git. External source text and LLM output are untrusted inputs. Runtime secrets belong in dedicated credential stores with the least privilege necessary.

Security reports should follow [SECURITY.md](SECURITY.md).

## License

This is a private repository and no license is granted by default. A license can be added later if the owner intentionally changes the distribution model.
