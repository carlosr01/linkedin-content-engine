# n8n Workflow Contracts

This document defines future workflow boundaries without guessing current n8n node parameters. Actual workflows must be built and semantically validated in n8n DEV using current official n8n skills and MCP capabilities, then retrieved and exported from that environment.

## Envelope

Every subworkflow invocation should carry an envelope equivalent to:

```json
{
  "contractVersion": 1,
  "correlationId": "stable-per-editorial-item-or-request",
  "invocationId": "unique-per-attempt",
  "occurredAt": "RFC3339 timestamp",
  "payload": {}
}
```

The caller validates input before invocation; the callee validates again at its boundary. Errors return a machine-readable category, retryability, safe message, and correlation ID. Errors never contain credentials or complete source/private content.

## WF01 — Discovery

- **Trigger:** bounded schedule or operator-authorized manual DEV run.
- **Input:** enabled source catalog, run limit, and environment identifier.
- **Output:** candidate IDs and per-source counts for discovered, duplicate, scored, selected, and failed items.
- **Writes:** normalized source and candidate records; score records.
- **Idempotency:** canonical URL plus content hash; the same item must not create a second candidate.
- **Must not:** draft, approve, publish, or turn untrusted source text into workflow instructions.

## WF02 — Reference Ingestion

- **Trigger:** authenticated Telegram message containing one supported URL.
- **Input:** chat/user identity, message ID, submitted URL, receipt time.
- **Output:** existing or newly created candidate ID and a safe user-facing status.
- **Writes:** source and candidate records; processed-message idempotency record.
- **Idempotency:** Telegram update/message identity plus canonical URL/content hash.
- **Must not:** accept arbitrary commands from retrieved content, approve a draft, or publish.

## WF03 — Editorial

- **Trigger:** selected candidate or a human revision request.
- **Input:** candidate ID, brand-context version, content policy version, optional prior draft/version and human comments.
- **Output:** immutable schema-valid draft version, quality findings, and fact-review findings.
- **Writes:** draft and draft-version records; model/prompt provenance.
- **Idempotency:** candidate, prompt/contract version, brand-context version, and revision request identity.
- **Must not:** invent facts, mark a draft approved, or invoke LinkedIn.

## WF04 — Approval and Publishing

- **Review input:** draft ID/version and authenticated Telegram reviewer context.
- **Review output:** exactly one `APPROVE`, `REVISE`, or `REJECT` record for the displayed version.
- **Publication input:** approval ID, exact draft ID/version, deterministic idempotency key.
- **Publication output:** `publication-result.schema.json`.
- **Idempotency:** unique approval/version publication key; only one active attempt can own it.
- **Independent guards:** current draft matches approval, decision is `APPROVE`, reviewer is authorized, no successful publication exists, policy validation passes, and the LinkedIn credential belongs to the intended environment.
- **Must not:** treat an LLM response, Telegram delivery, old approval, or schedule as approval.

Review and publication should be separate subworkflows so the external side effect has a narrow, testable input contract.

## WF05 — Analytics

- **Trigger:** bounded schedule or successful publication event.
- **Input:** publication ID, platform post ID, permitted metric window.
- **Output:** normalized performance metrics with retrieval timestamp.
- **Writes:** performance metric records and aggregate evidence.
- **Idempotency:** publication, metric name, and observation window.
- **Must not:** change policy thresholds or create/publish content.

## Shared subworkflow expectations

Reusable logic should be stateless where practical and have one responsibility: URL canonicalization, schema validation, sanitized error formatting, policy evaluation, or idempotency acquisition. Native nodes and expressions are preferred. Code nodes require a documented reason and focused tests.

## Semantic validation gate

Repository validation confirms JSON syntax and minimal export shape only. Completion of any n8n change additionally requires:

1. load the official n8n meta-skill and relevant capability skills;
2. inspect current node and MCP behavior;
3. create/update only in n8n DEV;
4. run structural and semantic validation through live tooling;
5. test success, rejection, retry, and duplicate paths with non-production data;
6. re-retrieve the persisted workflow and verify it;
7. export and sanitize it for Git.
