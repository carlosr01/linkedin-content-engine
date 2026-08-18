# Operations

This is the future operational baseline; Phase 0 creates no runtime services.

## Common failure modes

| Failure                           | Expected handling                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Discovery source fails            | Isolate the source, record a sanitized category, retry with bounded backoff, and let other sources continue.                    |
| API rate limit                    | Honor provider reset/retry hints, reduce concurrency, and alert before the queue becomes stale.                                 |
| OpenAI failure or invalid output  | Retry a bounded number of times, validate every response, then route the item to manual review.                                 |
| Telegram delivery/command failure | Preserve review state, retry delivery safely, authenticate commands, and never infer approval.                                  |
| LinkedIn publication failure      | Persist the attempt, classify definitive vs unknown outcomes, reconcile platform state, and reuse the same idempotency key.     |
| OAuth token expired/revoked       | Stop the affected integration, alert through a trusted channel, and require authorized reauthentication without logging tokens. |
| Duplicate trigger                 | Acquire the entity/idempotency lock and return the existing result instead of repeating side effects.                           |
| Queue item exhausted retries      | Move to a dead-letter/manual-review state with correlation ID and recovery instructions.                                        |

## Retry policy

- Retry only errors classified as transient.
- Use exponential backoff with jitter and a provider-aware maximum.
- Persist attempt count and last safe error category.
- Never retry validation, authorization, policy, stale-approval, or rejected-review failures automatically.
- For an unknown LinkedIn outcome, query/reconcile before another create request.

## Dead-letter and manual review

Repeated or non-retryable failures retain the payload reference, stage, correlation ID, sanitized error, and proposed operator action. Manual recovery must revalidate current state, policy, approval version, and idempotency; it cannot jump directly to `PUBLISHING` from an unapproved state.

## Alerting priorities

1. Possible unauthorized or duplicate publication.
2. Credential exposure or repeated authentication failure.
3. Unknown LinkedIn publication outcome.
4. Approval queue unavailable or stale.
5. Discovery/editorial backlog, source degradation, or budget threshold.

Alerts should state environment, workflow, correlation ID, impact, and safe next action without secrets or complete private content.

## Operational signals

Track execution success/failure by stage, queue age, retry/dead-letter count, duplicates suppressed, model validation failures, token/cost budget, review latency, publication reconciliation, and API rate-limit headroom. Metrics support human decisions; they do not authorize content or silently change policy.

## Runbook skeleton

1. Verify the environment and workflow version.
2. Identify the correlation ID and last durable state.
3. Determine whether any external side effect may have occurred.
4. Contain risk; stop publication paths first when uncertain.
5. Apply the narrow recovery procedure.
6. Revalidate state and record sanitized evidence.
7. Open a follow-up issue for systemic fixes.
