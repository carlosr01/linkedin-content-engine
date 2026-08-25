# Issue #2 — WF01 content discovery verification evidence

This record documents the DEV-only implementation and verification of [Issue #2](https://github.com/carlosr01/linkedin-content-engine/issues/2): WF01 content discovery. It is evidence for the bounded discovery workflow; it does not authorize activation, production deployment, external-service configuration, drafting, approval, or publishing.

No OAuth token, password, cookie, encryption key, API key, credential export, private source payload, or production identifier is recorded here.

## Purpose and environment boundary

WF01 implements only this discovery path:

```text
scheduled discovery / manual DEV test
  → configured source retrieval
  → normalization and canonicalization
  → SHA-256 content hashing
  → canonical-URL and content-hash suppression
  → SourceRecord / ContentCandidate construction
  → relevance scoring
  → deterministic policy threshold
  → DEV Data Table persistence
```

It does not generate a LinkedIn draft, request or record approval, schedule publication, invoke WF02–WF05, contact LinkedIn/Telegram/Gmail, or publish anything.

| Control             | Verified state                                          |
| ------------------- | ------------------------------------------------------- |
| n8n environment     | DEV only                                                |
| DEV identity        | `https://n8n-dev.innovaq-ai.com`                        |
| DEV workflow ID     | `MBjubZf00zHeukFo`                                      |
| Workflow name       | `WF01__content_discovery`                               |
| Activation state    | `active: false`                                         |
| Production access   | Not accessed, inspected, queried, inferred, or modified |
| Credentials created | None                                                    |

The n8n MCP endpoint was confirmed as the DEV endpoint before every write. No production endpoint, credential, workflow, table, or other resource was used.

## Official n8n Skills and live definitions

The official meta-skill `using-n8n-skills-official` was loaded before n8n work and routed the implementation through the applicable official capability Skills:

| Official Skill                          | Use in WF01                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `using-n8n-skills-official`             | Current MCP protocol, SDK workflow lifecycle, and verification rules                                     |
| `n8n-workflow-lifecycle-official`       | Design, validation, persisted readback, test pinning, and inactive-state checks                          |
| `n8n-node-configuration-official`       | Live node parameters, trigger, HTTP, Data Table, and merge behavior                                      |
| `n8n-expressions-official`              | Branch-safe expressions and field mapping                                                                |
| `n8n-code-nodes-official`               | Narrowly scoped normalization, contract validation, fixture, and diagnostic code                         |
| `n8n-data-tables-official`              | Table design, `rowNotExists`, and stable-key upsert patterns                                             |
| `n8n-agents-official`                   | Structured-output and untrusted-data prompt boundaries; no agent was created                             |
| `n8n-subworkflows-official`             | Inspected and not applicable: WF01 has one current consumer and no repeated reusable invocation boundary |
| `n8n-loops-official`                    | Bounded item handling and the native Limit node                                                          |
| `n8n-error-handling-official`           | Per-node error outputs and sanitized local diagnostics                                                   |
| `n8n-credentials-and-security-official` | DEV-only credential inspection and no-secret handling                                                    |

The user-requested `n8n-code-javascript-official` and `n8n-ai-official` names were not installed under those exact names; their installed official counterparts, `n8n-code-nodes-official` and `n8n-agents-official`, were used instead.

Live n8n DEV definitions, rather than remembered settings, were used for the persisted node graph. Notable persisted versions include Manual Trigger v1, Schedule Trigger v1.3, HTTP Request v4.5, XML v1, Crypto v2, Limit v1, If v2.3, Code v2, Data Table v1.1, and Merge v3.2.

## Workflow architecture

The final persisted workflow contains 24 nodes. It is deliberately inactive and has both a Manual Trigger for controlled DEV verification and a daily 08:00 `America/Lima` Schedule Trigger. The inactive workflow has no active version.

```text
Manual DEV test ─┐
                 ├→ create bounded DEV run context → expand enabled scheduled sources
Daily schedule ──┘                                      → HTTP GET (RSS only; 30 s, three attempts)
                                                          → controlled-failure gate
                                                          → bounded RSS pre-validation → native XML parse
                                                          → normalize untrusted entries → validate → Limit 25
                                                          → native SHA-256 → SourceRecord / ContentCandidate
                                                          → contract validation
                                                          ├→ SourceRecord Data Table upsert
                                                          └→ canonical URL absence → content-hash absence
                                                               → deterministic DEV score fixture
                                                               → score validation + fixed threshold
                                                               → ContentScore Data Table upsert
                                                               → ContentCandidate Data Table upsert

Every fallible branch ─→ sanitized local diagnostic
```

Two Merge nodes wait for their related SourceRecord and ContentScore upserts before the next persistence step. Their two inputs are explicitly configured. A visual node group was not committed because the live n8n instance rejected groups spanning the error-isolated graph; clear node names and this record capture ownership and purpose instead.

### Source and runtime boundaries

The run context mirrors the repository examples:

| Contract value                 | Persisted value |
| ------------------------------ | --------------- |
| Environment                    | `development`   |
| `dry_run`                      | `true`          |
| `source_fetch_timeout_seconds` | 30 seconds      |
| `maximum_candidates_per_run`   | 25              |
| `retry_attempts`               | 3               |
| `require_correlation_id`       | `true`          |
| `minimum_relevance_score`      | 75              |

The workflow processes only enabled scheduled, non-manual source entries. The only configured source is the repository’s enabled public scheduled source:

- `OpenAI News RSS` — `https://openai.com/news/rss.xml`

`type: manual_url` is excluded from WF01. That intake remains reserved for WF02, as required by `config/sources.example.yaml`.

The HTTP Request node uses no authentication or credential. Its persisted configuration is an HTTP GET to the source contract URL, with a 30,000 ms timeout, `retryOnFail: true`, `maxTries: 3`, a 5,000 ms retry wait, and error output routing. This is the bounded retry policy; it was not increased.

### Normalization, contracts, and hashing

Source text is treated as untrusted evidence. The normalizer never evaluates source text as workflow instructions and performs deterministic transformations only:

- accepts HTTP/HTTPS URLs only and rejects user-info URLs;
- lower-cases scheme and host, removes the fragment, collapses default ports, preserves non-default ports, and gives an empty path `/`;
- removes only documented tracking parameters (`utm_*`, `gclid`, `fbclid`, `mc_cid`, `mc_eid`);
- preserves non-tracking parameter order and values, so identity-changing query components are not silently discarded;
- normalizes source text deterministically before hashing; and
- uses the native Crypto node to produce a lowercase SHA-256 hexadecimal `contentHash` from a deterministic representation of `contractVersion`, title, author, published time, language, and extracted text.

The workflow builds and validates exact `SourceRecord` and `ContentCandidate` objects before persistence. The candidate validator rejects extra or missing contract fields. WF01 only uses discovery-stage candidate statuses: `NORMALIZED`, `SCORED`, and `SELECTED`; it cannot set any drafting, review, approval, scheduling, publishing, or rejection status.

The score validator similarly checks the exact `ContentScore` key set, six integer dimensions in the 0–100 range, the permitted format enum, and the candidate ID before storing a score.

### Prompt-injection boundary and scoring

The trusted scorer instructions mirror `prompts/content-scorer.md`: structured `ContentScore` JSON only, conservative evidence-based scoring, no invented facts, and an advisory `recommended` field. Candidate and source data are JSON-delimited in a `<UNTRUSTED_SOURCE_DATA_JSON>` boundary. Angle brackets in the evidence are escaped before the prompt is assembled.

The workflow, not the model, applies the policy:

```text
deterministicSelected = relevanceScore >= 75
```

The model-style `recommended` value is never used as the selection authority. The final prompt-injection fixture contained requests to change the threshold, create credentials, invoke tools, and publish; it was processed solely as source data, retained the fixed threshold of 75, and persisted one selected candidate without any external service call.

## DEV Data Table persistence

Before tables were created, the live MCP capability and DEV OAuth permission were inspected. The client successfully created and re-read the minimum required DEV Data Tables, which proves the available minimum Data Table create/read/write capability for this project. No OAuth scope was changed or broadened.

| Logical table             | Stable key                               | Purpose                                 |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| `WF01 Source Records`     | `sourceRecordId = source:<canonicalUrl>` | Normalized source evidence              |
| `WF01 Content Candidates` | `candidateId = candidate:<contentHash>`  | Discovery candidate and lifecycle stage |
| `WF01 Content Scores`     | `candidateId`                            | One current score per candidate         |

Source records, scores, and candidates use native Data Table `upsert` operations with their stable keys. Candidate admission is guarded by two sequential native `rowNotExists` checks against the candidate table:

1. canonical URL must not exist; then
2. content hash must not exist.

This prevents a repeated canonical resource and a different URL with identical normalized content from creating a second candidate. Repeated sequential executions were tested against real DEV Data Tables and did not create a second candidate.

The repository export is sanitized: it keeps Data Table names but replaces DEV table IDs with explicit `__DEV_DATA_TABLE_…__` placeholders. An operator must rebind those placeholders from live DEV node resources before any future import; no table ID, credential, or token is committed.

## Credential gate

No shared `openAiApi` credential was available to the DEV workflow through the MCP client, and no credential was created, copied, configured, or exposed.

| Check                                    | Result                                     |
| ---------------------------------------- | ------------------------------------------ |
| Existing approved DEV-only AI credential | Not available to this client               |
| `LIVE_AI_SCORING`                        | `BLOCKED_CREDENTIAL`                       |
| Current dry-run score mode               | Schema-valid deterministic fixture         |
| Live-model fallback                      | Blocked before score/candidate persistence |

Minimum manual action to remove the blocker: a DEV administrator must make one approved DEV-only AI credential available to this workflow’s authorized DEV context, then separately authorize native-node configuration and live scoring tests. Do not create a credential, copy a production credential, paste a credential value, or change OAuth scope automatically.

## Test matrix

All `test_workflow` fixture executions pinned the HTTP Request node. Trigger nodes and all safe local nodes executed in DEV; Data Table writes were real DEV-local persistence. The pinned HTTP node made no network request. The one live-source manual execution made a read-only GET to the configured public OpenAI News RSS and wrote only DEV Data Tables.

| Verification                                             | Evidence                                                                                                                                 | Result                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Successful live scheduled-source path                    | Manual execution 25: source fetched, pre-validated, parsed, limited, contract-validated, and 25 source/score/candidate records persisted | PASS                                                                                                                  |
| Normalization and SHA-256                                | Pinned execution 7 produced canonical URL and lowercase 64-hex hash                                                                      | PASS                                                                                                                  |
| SourceRecord / ContentCandidate / ContentScore contracts | Successful fixture path and exact workflow contract validators                                                                           | PASS                                                                                                                  |
| Canonical URL deduplication                              | Execution 12: later run stopped at canonical URL absence check; no candidate persisted                                                   | PASS                                                                                                                  |
| Content-hash deduplication                               | Execution 13: different canonical URL reached URL check but stopped at content-hash absence check; no candidate persisted                | PASS                                                                                                                  |
| Repeat-run idempotency                                   | Execution 12 reused the same canonical content on a later run; no duplicate candidate, score, or candidate write                         | PASS                                                                                                                  |
| Source failure isolation                                 | Execution 17: valid item persisted while malformed sibling routed to diagnostics                                                         | PASS                                                                                                                  |
| Timeout handling                                         | Execution 14: controlled `HTTP_TIMEOUT` sibling did not stop a valid source                                                              | PASS                                                                                                                  |
| Bounded retry policy                                     | Persisted HTTP settings: 30 s timeout, three total attempts, 5 s wait; controlled timeout fixture isolated safely                        | PASS — configuration and isolation verified; pinned HTTP tests intentionally do not induce repeated outbound requests |
| Rate-limit handling                                      | Execution 15: controlled `RATE_LIMIT` routed to diagnostics with no persistence                                                          | PASS                                                                                                                  |
| Source unavailable                                       | Execution 26: controlled `SOURCE_UNAVAILABLE` routed to diagnostics with no persistence                                                  | PASS                                                                                                                  |
| Invalid RSS / feed data                                  | Execution 20: malformed XML classified `MALFORMED_SOURCE`, no candidate persisted                                                        | PASS                                                                                                                  |
| Invalid score output                                     | Execution 21: schema-invalid score classified `SCHEMA_INVALID_SCORE_OUTPUT`, no score or candidate persisted                             | PASS                                                                                                                  |
| Missing AI credential                                    | Execution 22: non-dry-run fixture classified `AI_CREDENTIAL_UNAVAILABLE`, no score or candidate persisted                                | PASS                                                                                                                  |
| Prompt injection treated as data                         | Execution 27: untrusted instruction fixture retained threshold 75 and produced no side effect                                            | PASS                                                                                                                  |
| Maximum candidates per run                               | Execution 23: 26 normalized fixture items became exactly 25 persisted records                                                            | PASS                                                                                                                  |
| No drafting / approval / publishing                      | Persisted node/type/credential inspection: no draft, review, Telegram, LinkedIn, approval, schedule-publication, or publishing node      | PASS                                                                                                                  |

The live RSS execution also emitted sanitized `MALFORMED_ARTICLE` diagnostics for entries that could not satisfy normalization requirements; valid entries continued through the 25-item bound. No source content was treated as an instruction.

## Persisted readback and sanitized export

After each workflow update, the definition was retrieved again from n8n DEV. The final persisted readback confirmed:

- exact workflow name `WF01__content_discovery`;
- 24-node graph, including both required triggers;
- current node versions and explicit merge input counts;
- configured public RSS source, 30-second timeout, three-attempt retry bound, and 25-item limit;
- the three named Data Tables and the two candidate suppression checks;
- no node credentials;
- no LinkedIn, Telegram, Gmail, approval, draft, or publication node;
- no production endpoint/reference; and
- inactive state (`active: false`).

The canonical sanitized export retrieved from that readback is [`workflows/discovery/WF01__content_discovery.json`](../../workflows/discovery/WF01__content_discovery.json). It intentionally replaces environment-specific node IDs and Data Table IDs. Repository validation checks JSON shape; live n8n semantic validation and persisted readback remain the authoritative behavior checks.

## Residual boundary and next review

WF01 is ready for review as an inactive DEV workflow. The only unresolved implementation gate is live AI scoring, which remains correctly blocked until an approved DEV-only credential is made available through a separate, least-privilege action.

Before any activation, live model use, additional source, workflow import, production deployment, or downstream WF02–WF05 work, repeat the official-Skills preflight and obtain specific human authorization. Never transfer this DEV evidence or its callback/client configuration to PROD.
