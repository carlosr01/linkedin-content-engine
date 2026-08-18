# ADR-003: Keep runtime definitions in GitHub and secrets in the runtime

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

n8n stores live workflow configuration and credentials, while reliable engineering requires reviewable history, validation, and reproducible promotion.

## Decision

Use GitHub as the source of truth for sanitized workflow exports, schemas, prompts, configuration contracts, documentation, tests, and deployment records. Keep credentials in environment-specific runtime credential stores; never commit or log them.

## Rationale

This separates reviewable behavior from sensitive runtime state and enables CI, pull requests, rollback references, and agent guardrails.

## Consequences

- Every runtime change must be re-read, verified, exported, sanitized, and committed.
- DEV/PROD identifiers and credentials need explicit mapping during controlled deployment.
- Repository exports alone are insufficient evidence of live state; post-change verification is mandatory.
- Secret rotation and backup remain runtime operational responsibilities.
