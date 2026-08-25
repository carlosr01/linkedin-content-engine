# Tests

- `fixtures/` contains synthetic, non-sensitive valid and invalid contract examples.
- `schemas/` verifies a valid candidate plus out-of-range scoring, invalid approval, and missing-required-field rejection.
- `workflows/` verifies minimum export-shape and malformed-JSON diagnostics without pretending to test n8n semantics.
- `workflows/wf01-content-discovery.test.mjs` protects the WF01 export's inactive DEV boundary, runtime caps, source boundary, duplicate gates, Data Table placeholders, and schema-facing controls.
- Root-level tests protect configuration and secret-scan behavior.

Run with `npm test`. Never copy production executions or private source content into fixtures.
