# ADR-004: Start with the simplest storage that satisfies workflow guarantees

- **Status:** Accepted; implementation choice deferred
- **Date:** 2026-08-18

## Context

V1 needs candidate tracking, draft versions, approvals, publication idempotency, and modest analytics. Exact concurrency and query requirements are not yet measured.

## Decision

Evaluate Google Sheets, n8n Data Tables, and PostgreSQL per workflow need. Begin simply, but require atomic uniqueness at the approval/publication boundary. Do not introduce a vector database unless evidence shows retrieval quality or scale requires it.

## Rationale

Premature infrastructure increases cost and operational burden. A transactional store is justified where duplicate-prevention guarantees exceed the capabilities of a simple table.

## Consequences

- Phase 1/2 must test concurrency and recovery needs before final selection.
- Logical schemas remain storage-independent.
- Migration paths and retention must be documented when a store is selected.
- Vector search is an explicit later decision, not a default dependency.
