# Product Requirements Document

## Product

**LinkedIn Content Engine** — a single-owner editorial automation system with mandatory human publication control.

## Problem

Consistent, high-quality LinkedIn publishing requires discovering relevant sources, filtering noise, identifying worthwhile insights, adapting information to a personal position, drafting, checking facts, reviewing, publishing, and learning from performance. Doing each step manually consumes excessive time and makes provenance and follow-up inconsistent.

## Objective

Reduce the human effort required to maintain a high-quality LinkedIn publishing system while retaining final editorial and reputational control.

## Primary user

One personal-brand owner who submits references, reviews complete drafts, requests revisions, rejects unsuitable work, and explicitly approves publication.

## V1 success condition

The owner spends most of their editorial time reviewing, editing when needed, and approving or rejecting. They should not routinely search dozens of sources, copy source information, format drafts, or maintain tracking spreadsheets by hand.

Operational success also requires that every published post can be traced to an exact approved draft version and its supporting sources, and that a retry cannot publish the same approval twice.

## Product principles

1. **Human approval is a gate, not a suggestion.** Only `APPROVE` for the exact current draft version can authorize publication.
2. **Ground before generating.** Facts and source provenance travel with the candidate and draft.
3. **Fail closed.** Missing approval, invalid schemas, uncertain claims, or ambiguous state block external actions.
4. **Simple operations first.** Use the smallest reliable storage and workflow design; add infrastructure only in response to evidence.
5. **GitHub is the source of truth.** Runtime credentials remain outside version control.

## Functional requirements

| ID     | Requirement                   | Acceptance signal                                                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Source ingestion              | The system can ingest enabled sources and record retrieval provenance without treating source text as instructions. |
| FR-002 | Candidate normalization       | Source-specific input becomes a valid canonical candidate with timestamps, language, URL, and content hash.         |
| FR-003 | Deduplication                 | Canonical URL and content hash prevent known material from creating duplicate candidates.                           |
| FR-004 | Relevance scoring             | A schema-valid score explains relevance, brand fit, value, novelty, authority, and opinion potential.               |
| FR-005 | Brand-context retrieval       | Drafting receives the current approved positioning, tone, pillars, and examples with version provenance.            |
| FR-006 | Draft creation                | A selected candidate can produce an original, versioned, schema-valid LinkedIn draft.                               |
| FR-007 | Grounding/source tracking     | Draft factual claims retain source IDs and verification status through review and publication logging.              |
| FR-008 | Human review                  | The owner receives the complete final text and enough source context to make an informed decision.                  |
| FR-009 | Revision loop                 | `REVISE` creates a new draft version, invalidating any approval associated with an older version.                   |
| FR-010 | Explicit approval             | Publication accepts only a durable `APPROVE` decision made by the authorized reviewer for the exact draft version.  |
| FR-011 | LinkedIn publishing           | An approved version can be sent once through the authorized LinkedIn API; no scraping-based publication.            |
| FR-012 | Publication logging           | Every attempt records its approval, idempotency key, status, platform identifier or sanitized error, and timestamp. |
| FR-013 | Failure handling              | Bounded retries, terminal failure states, and manual recovery avoid silent data loss and duplicate side effects.    |
| FR-014 | Analytics feedback            | Permitted performance metrics can be related to content pillar and format without changing policy silently.         |
| FR-015 | Telegram manual URL ingestion | The authorized owner can submit a URL through Telegram and receive a normalized candidate or actionable failure.    |

## Non-functional requirements

### Security

Credentials are stored in runtime credential stores with least privilege. DEV and PROD are separated. External content and LLM output are untrusted; logs are sanitized.

### Idempotency and consistency

Each side-effecting step uses a stable idempotency key and persisted state. State transitions use optimistic or atomic checks so concurrent runs cannot publish twice.

### Traceability and auditability

Candidates, draft versions, approval decisions, and publication attempts carry stable identifiers, timestamps, provenance, and correlation IDs.

### Observability

Workflows expose execution status, latency, error category, retry count, and correlation ID without credentials or unnecessary personal data.

### Recoverability

Operators can identify a failed stage, safely retry idempotent work, resume a review, and perform documented rollback or manual recovery.

### Modularity and maintainability

Five workflow domains have explicit contracts. Shared logic becomes stateless subworkflows. Schemas, prompts, docs, and exports are version-controlled and validated.

### Operational simplicity and cost

V1 minimizes services and uses bounded source volume, model calls, tokens, retries, and retention. Storage decisions are based on query and reliability needs, not novelty.

## Out of scope for V1

- autonomous or scheduled-without-approval publishing;
- unauthorized LinkedIn scraping;
- engagement bots, automated likes, or automated comments;
- mass outreach or lead-generation automation;
- a custom social-media dashboard or frontend;
- multi-tenant SaaS;
- Postiz;
- a vector database unless measured retrieval needs justify it;
- multi-platform publishing;
- production infrastructure creation during repository bootstrap.

## Release gate

V1 cannot be considered ready until the human-approval invariant, draft-version binding, duplicate prevention, failure recovery, least-privilege credentials, and DEV-to-PROD deployment procedure have been demonstrated with tests and owner acceptance.
