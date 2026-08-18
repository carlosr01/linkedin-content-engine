# n8n workflow exports

This directory will contain sanitized JSON exports retrieved from n8n DEV after live structural and semantic validation. Phase 0 intentionally contains no workflow JSON; plausible-looking exports must not be fabricated from model memory.

| Category               | Intended content                                           |
| ---------------------- | ---------------------------------------------------------- |
| `discovery/`           | WF01 ingestion, normalization, deduplication, and scoring. |
| `reference-ingestion/` | WF02 Telegram manual URL intake.                           |
| `editorial/`           | WF03 drafting, critique, and fact review.                  |
| `approval/`            | Human review and exact-version approval handling.          |
| `publishing/`          | Narrow, idempotent LinkedIn publication boundary.          |
| `analytics/`           | WF05 permitted performance feedback.                       |
| `shared/`              | Stateless, single-purpose subworkflows.                    |

## Adding an export

1. Load current official n8n skills and inspect the live DEV/MCP capabilities.
2. Build or update only in n8n DEV using current node definitions.
3. Validate and test success, failure, rejection, and duplicate paths.
4. Retrieve the stored workflow again and verify the actual configuration.
5. Export it from DEV, remove credentials and instance-specific sensitive data, and place it in the appropriate category.
6. Run `npm run validate:workflows` and `npm run ci`.

Repository validation checks JSON and a minimal export shape. It does not claim to validate n8n semantics.
