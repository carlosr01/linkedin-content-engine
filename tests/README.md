# Tests

- `fixtures/` contains synthetic, non-sensitive valid and invalid contract examples.
- `schemas/` verifies a valid candidate plus out-of-range scoring, invalid approval, and missing-required-field rejection.
- `workflows/` verifies minimum export-shape and malformed-JSON diagnostics without pretending to test n8n semantics.
- Root-level tests protect configuration and secret-scan behavior.

Run with `npm test`. Never copy production executions or private source content into fixtures.
