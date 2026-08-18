# ADR-001: Use n8n as the primary orchestration runtime

- **Status:** Accepted for V1
- **Date:** 2026-08-18

## Context

The product is dominated by scheduled work, third-party integrations, review waits, retries, and observable state transitions rather than an application UI.

## Decision

Use n8n as the primary workflow orchestration runtime. Keep product contracts, prompts, workflow exports, tests, and operating rules in GitHub.

## Rationale

n8n fits integration-heavy orchestration and reduces custom backend code. Its visual workflow model can make service boundaries and operations legible when paired with versioned exports and schemas.

## Consequences

- Less custom integration and scheduling code.
- Workflow design must remain modular and reviewable rather than becoming one large canvas.
- Repository checks cannot prove n8n node semantics; live DEV validation and export verification are required.
- The team depends on current official n8n skills/documentation and must not configure nodes from model memory.
