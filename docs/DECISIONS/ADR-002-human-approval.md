# ADR-002: Require human approval before publication

- **Status:** Accepted and non-negotiable
- **Date:** 2026-08-18

## Context

Publishing affects the owner's personal brand and may expose factual, legal, or reputational mistakes. LLM generation and source processing are probabilistic and exposed to untrusted input.

## Decision

Require an authenticated human `APPROVE` decision for the exact draft ID and version before every LinkedIn publication. Revision invalidates approval of the prior version. The publication boundary revalidates approval and idempotency independently.

## Rationale

Human editorial control limits reputational risk and keeps judgment with the owner rather than an automated scorer or model.

## Consequences

- There is no auto-publish mode, including for scheduled posts.
- The state model, schemas, UI messages, tests, and operations must preserve exact-version binding.
- Approval latency is accepted as a core product constraint.
- Missing, stale, or ambiguous approval fails closed.
