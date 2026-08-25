# Issue #2 — WF01 content discovery (DEV verification)

This record is the current DEV-only evidence for [Issue #2](https://github.com/carlosr01/linkedin-content-engine/issues/2). It documents the persisted native AI scoring path in WF01 and its controlled verification. It does not authorize activation, production deployment, source expansion, drafting, approval, publishing, or any downstream workflow.

No API key, token, password, cookie, private source payload, credential export, credential identifier, or credential display name is recorded in this repository document.

## Scope and DEV boundary

| Control                                       | Verified state                 |
| --------------------------------------------- | ------------------------------ |
| N8N_DEV_IDENTITY                              | https://n8n-dev.innovaq-ai.com |
| Workflow ID in DEV                            | MBjubZf00zHeukFo               |
| Workflow name                                 | WF01__content_discovery        |
| Workflow active                               | false                          |
| Branch                                        | feat/wf01-content-discovery    |
| Production touched                            | false                          |
| Credentials created, shared, moved, or listed | none                           |
| Workflow activation                           | not performed                  |
| Publication, drafting, approval, or messaging | not present or invoked         |

The only external AI endpoint exercised was the approved DEV OpenRouter integration through the native model node. No RSS request was made during the controlled scoring verification, and no production endpoint, credential, workflow, table, or service was read or modified.

## Persisted native scoring architecture

WF01 remains a bounded discovery and scoring workflow. Its persisted graph contains 28 nodes and keeps the existing source normalization, SHA-256, duplicate suppression, contract validation, deterministic threshold, DEV Data Table persistence, and sanitized diagnostic routes.

```text
SourceRecord and ContentCandidate validation
  -> SourceRecord upsert
  -> canonical URL and content-hash suppression
  -> Basic LLM Chain
       <- OpenRouter Chat Model
       <- Structured Output Parser
  -> deterministic score validation and threshold
  -> ContentScore upsert
  -> ContentCandidate upsert
```

| Audit key                    | Persisted DEV value                                             |
| ---------------------------- | --------------------------------------------------------------- |
| AI_PROVIDER                  | OpenRouter                                                      |
| AI_NODE                      | OpenRouter Chat Model                                           |
| AI_NODE_VERSION              | 1                                                               |
| AI node type                 | @n8n/n8n-nodes-langchain.lmChatOpenRouter                       |
| MODEL                        | deepseek/deepseek-v4-flash-0731                                 |
| MODEL_LOCKED                 | true; static exact model value, no alias and no :nitro suffix   |
| BASIC_LLM_CHAIN              | 1.9                                                             |
| Basic chain type             | @n8n/n8n-nodes-langchain.chainLlm                               |
| STRUCTURED_OUTPUT_PARSER     | 1.3                                                             |
| Parser type                  | @n8n/n8n-nodes-langchain.outputParserStructured                 |
| Parser mode                  | manual ContentScore JSON Schema                                 |
| Parser schema representation | JSON-serialized copy of schemas/content-score.schema.json       |
| Parser auto-fix              | false; invalid output fails closed without adding a fixer model |
| AI Agent                     | absent                                                          |
| AI tool connection           | absent                                                          |

The OpenRouter model node connects to the Basic LLM Chain through ai_languageModel. The Structured Output Parser connects to the same Chain through ai_outputParser. The Chain success output goes to deterministic validation; its error output goes only to the sanitized diagnostic node.

## Credential boundary

The persisted DEV model node has one credential reference of type openRouterApi. Its reference ID and display name were checked only for presence during persisted readback; neither value nor any secret was printed, exported, copied, changed, or committed.

| Check                       | Result                                                     |
| --------------------------- | ---------------------------------------------------------- |
| CREDENTIAL_BOUND            | true                                                       |
| CREDENTIAL_SECRET_EXPOSED   | false                                                      |
| Credential secret inspected | false                                                      |
| Credential list queried     | false                                                      |
| Credential mutation         | false                                                      |
| Sanitized repository export | no credentials object, token, key, or credential reference |

The sanitized export intentionally omits the live credential reference. A human operator remains the authority for binding the approved DEV credential in n8n.

## Structured-output and deterministic controls

The Chain prompt keeps candidate and source material inside UNTRUSTED_SOURCE_DATA_JSON markers. It explicitly instructs the model to treat the material as data, not instructions; never change policy, threshold, credential, workflow, lifecycle, drafting, approval, or publication; never invoke tools or external actions; and copy candidate.id exactly as the opaque candidateId value.

The parser enforces the repository ContentScore schema with exactly these required fields:

```text
candidateId
relevanceScore
brandAlignment
audienceValue
novelty
authority
opinionPotential
recommended
reason
contentPillar
recommendedFormat
```

The deterministic post-validator independently requires exact keys, candidateId equality, six integer dimensions in the inclusive 0–100 range, boolean recommended, a non-empty reason and contentPillar, and an allowed recommendedFormat. It then applies:

```text
deterministicSelected = relevanceScore >= 75
```

The recommended field is never used to choose the candidate status. A score below 75 becomes SCORED; a score at least 75 becomes SELECTED.

## Controlled live OpenRouter verification

A single unique synthetic candidate was injected temporarily only for the Manual Trigger test route, then the temporary node and connections were removed. The source URL used the non-routable example.invalid domain, so the test did not fetch a source. Its source text carried attempts to change threshold 75, ignore trusted instructions, request credentials, invoke tools, and publish content. Those strings remained untrusted data.

The successful live scoring execution was DEV execution 32:

| Check                     | Evidence                                                                                                           | Result |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| OPENROUTER_AUTH           | Native OpenRouter model node completed successfully with its persisted credential reference                        | PASS   |
| MODEL_ACCESS              | Exact persisted DeepSeek model completed the Chain request                                                         | PASS   |
| LIVE_AI_SCORING           | Basic LLM Chain and Structured Output Parser completed successfully                                                | PASS   |
| CONTENT_SCORE_SCHEMA      | Returned exactly the 11 ContentScore keys                                                                          | PASS   |
| CANDIDATE_ID_MATCH        | Returned candidateId exactly matched the controlled candidate ID                                                   | PASS   |
| DIMENSION_VALIDATION      | All six dimensions were integer values in 0–100                                                                    | PASS   |
| STRUCTURED_OUTPUT         | Parser v1.3 output reached deterministic validation as an object                                                   | PASS   |
| RECOMMENDED_ADVISORY      | Validator code does not branch on recommended                                                                      | PASS   |
| DETERMINISTIC_THRESHOLD   | relevanceScore was 0, thresholdApplied was 75, deterministicSelected was false, and status became SCORED           | PASS   |
| SCORE_PERSISTENCE         | Native ContentScore upsert completed                                                                               | PASS   |
| CANDIDATE_PERSISTENCE     | Native ContentCandidate upsert completed                                                                           | PASS   |
| PROMPT_INJECTION_BOUNDARY | Adversarial source text did not change the threshold, candidate ID, node graph, tool surface, or publication state | PASS   |

Execution 32 also completed the SourceRecord upsert. All three records are DEV Data Table records for the controlled candidate only. No publishing or messaging node exists downstream of them.

## Fail-closed verification

| Scenario                                 | Evidence                                                                                                                                                               | Result                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Parser-stage invalid configuration       | DEV execution 30 stopped at the parser and did not persist score or candidate; the schema was then corrected to its serialized repository form                         | PASS                                 |
| Invalid live model output                | DEV execution 31 returned candidateId "unknown"; deterministic validation rejected it and did not persist score or candidate                                           | PASS                                 |
| Invalid score shape                      | Test execution 33 pinned an incomplete score. The validator emitted only its error output, the diagnostic ran, and score/candidate persistence did not run             | PASS                                 |
| Malformed candidate                      | Test execution 34 removed candidate.id. Contract validation emitted only its error output; Chain, OpenRouter, and all persistence nodes were absent from the execution | PASS                                 |
| AI failure routing                       | The Chain has onError = continueErrorOutput and its second output connects only to sanitized diagnostics; neither persistence node is connected to that output         | PASS by persisted-graph verification |
| Invalid score cannot persist candidate   | Test execution 33 had no ContentScore or ContentCandidate persistence node execution                                                                                   | PASS                                 |
| No model tools or publication capability | No Agent node, ai_tool connection, draft, review, approval, publication, LinkedIn, Telegram, Gmail, or production reference exists                                     | PASS                                 |

A test-mode caveat was found and no further test execution was made: DEV test execution 35 contained pinData for the OpenRouter model, but the execution record showed the model node at approximately 20 seconds rather than the expected zero-time pin. The Data Table persistence nodes in that execution were pinned at zero time. This is treated as an n8n/MCP test-pinning drift and a possible additional DEV model inference, not as a valid model-failure simulation. It did not produce a repository or Data Table write. The persisted error route and the preceding empirical parser/model-output failures remain the evidence for the model/API fail-closed boundary.

## Live-call and side-effect accounting

| Item                                                                 | Recorded state                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Effective successful live scoring call                               | DEV execution 32                                                                        |
| Earlier live model output rejected by deterministic validation       | DEV execution 31                                                                        |
| Possible unexpected model execution during pinned test               | DEV execution 35; documented above                                                      |
| Live model calls observed                                            | 3 total model executions observed; only execution 32 is the successful scoring evidence |
| Live RSS requests during this verification                           | 0                                                                                       |
| DEV Data Table writes in successful live scoring                     | SourceRecord, ContentScore, and ContentCandidate upserts in execution 32                |
| DEV Data Table writes in pinned tests 33–35                          | none                                                                                    |
| PROD side effects                                                    | none                                                                                    |
| Publication, draft, approval, LinkedIn, Telegram, Gmail side effects | none                                                                                    |

## Persisted readback and sanitized export

After the temporary test route was removed, WF01 was re-read from n8n DEV. The final persisted readback confirmed:

- exact name WF01__content_discovery and inactive state false;
- 28-node graph with the Manual Trigger restored to Create bounded DEV run context;
- Basic LLM Chain v1.9, OpenRouter Chat Model v1, and Structured Output Parser v1.3;
- exact static model deepseek/deepseek-v4-flash-0731;
- a bound OpenRouter credential reference in DEV, without secret exposure;
- parser schema equal to schemas/content-score.schema.json after JSON parsing;
- deterministic relevanceScore >= 75 policy and advisory-only recommended field;
- sanitised per-node error outputs for contract, Chain, and score validation failures;
- no Agent, ai_tool, drafting, approval, publication, LinkedIn, Telegram, Gmail, or production surface; and
- no activation or production mutation.

The export at workflows/discovery/WF01__content_discovery.json originated from that final DEV readback. It removes workflow and version identifiers, replaces node IDs with deterministic non-instance placeholders, replaces all DEV Data Table IDs with explicit _*DEV_DATA_TABLE_WF01*...__ placeholders, and removes every credentials property. It contains no credential secret, credential reference, API key, token, or real DEV table ID.

## Review boundary

WF01 is ready for repository review as an inactive DEV workflow. This evidence does not make production changes safe, does not authorize merging by itself, and does not authorize closing Issue #2. A reviewer must consider the documented test-pinning drift, the observed DEV-only model-call accounting, repository CI, and normal PR review before making either decision.
