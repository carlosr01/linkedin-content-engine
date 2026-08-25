# Issue #1 — n8n DEV MCP verification evidence

This record closes the documentation and evidence portion of [Issue #1](https://github.com/carlosr01/linkedin-content-engine/issues/1): connect Codex to n8n DEV using official Skills and MCP. It records a completed, sanitized connectivity test; this documentation change does not access, configure, or mutate n8n.

No OAuth token, password, cookie, encryption key, API key, credential export, or other secret is recorded here.

## Purpose and boundary

The objective was to prove that Codex could use the explicitly identified n8n DEV instance through MCP while preserving the repository's environment and publication guardrails:

- The verified environment was **DEV only**, at `https://n8n-dev.innovaq-ai.com`.
- The DEV n8n service and its PostgreSQL service are isolated from PROD.
- The test did not access, inspect, or modify PROD.
- The test did not create credentials, configure an external integration, execute a workflow, activate a workflow, or publish content.
- The temporary artifact was removed from visible MCP workflow search after verification.

This document is evidence for the bounded connectivity test, not authorization for future workflow work. Any future n8n change remains subject to `AGENTS.md`, the official n8n Skills, DEV-only verification, and separate approval for its scope.

## Environment identity and isolation

| Control                   | Verified state                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| n8n environment           | DEV only                                                             |
| DEV URL                   | `https://n8n-dev.innovaq-ai.com`                                     |
| Runtime isolation         | n8n DEV and PostgreSQL DEV are separate from PROD resources          |
| Production access         | Not used or exposed                                                  |
| Documentation PR activity | Repository documentation only; no n8n action is performed by this PR |

An ambiguous n8n endpoint must always be treated as PROD until its DEV identity is confirmed. The test began from the configured DEV identity and used no other n8n instance.

## Official Skills verification

The official Skills used for the completed test were:

| Skill                             | Result and purpose                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `using-n8n-skills-official`       | Loaded before n8n MCP work; supplied the current MCP workflow protocol.                         |
| `n8n-workflow-lifecycle-official` | Used for discovery, validation, readback, inactive-state, and archive lifecycle rules.          |
| `n8n-node-configuration-official` | Used to inspect the live definition for the one local node before configuring it.               |
| `n8n-subworkflows-official`       | Inspected and determined not applicable: the artifact had one local node and no reusable logic. |

The client inspected **34** available n8n MCP capabilities before exercising the bounded workflow lifecycle. The evidence below does not include client secrets or a credential inventory.

## OAuth and MCP authorization model

Codex connects to the **instance-level MCP server of n8n DEV** as an OAuth-connected client. OAuth is the client authorization boundary; it is not a license to access another n8n instance, create credentials, activate workflows, or publish content.

For Issue #1, the connected client was used only for the minimum observable lifecycle needed to prove connectivity: inspect capabilities, search, create one inactive local-only artifact, retrieve it, compare it, archive it, and search again. The repository deliberately does not store OAuth scopes, access tokens, refresh tokens, cookies, or client secrets. The actual permission grant must continue to follow least privilege and be reviewed before any new class of n8n operation.

The MCP test established a DEV connection sufficient for those actions. It does not establish authority for PROD, external services, credential creation, or LinkedIn publication.

### Current OAuth callback policy

**Current known DEV state:** `Allowed callback URLs = All`.

This is a temporary **DEV-only** security exception pending a verified callback pattern compatible with Codex loopback OAuth. It is not an approved production configuration and it is not an allowlist pattern to copy elsewhere. No callback allowlist is invented in this repository. Before replacing this exception, verify the compatible callback behavior in DEV, record the exact reviewed policy, and then make the narrowest approved change.

## Sanitized connectivity evidence

| Check                              | Verified result                                         |
| ---------------------------------- | ------------------------------------------------------- |
| `N8N_DEV_IDENTITY`                 | **PASS** — `https://n8n-dev.innovaq-ai.com`             |
| `OFFICIAL_N8N_SKILLS_LOADED`       | **PASS** — the four outcomes listed above were recorded |
| `MCP_CONNECTION`                   | **PASS**                                                |
| `AVAILABLE_CAPABILITIES_INSPECTED` | **34**                                                  |
| `WORKFLOW_SEARCH_BEFORE`           | **PASS** — exact query returned `0` visible results     |
| `SAFE_CREATE`                      | **PASS** — temporary workflow ID `pU16XaxDc3R1m1sQ`     |
| `PERSISTED_READBACK`               | **PASS**                                                |
| `CONFIG_MATCH`                     | **PASS**                                                |
| `WORKFLOW_ACTIVE`                  | `false`                                                 |
| `SAFE_REMOVAL`                     | **PASS** — archive completed successfully               |
| `WORKFLOW_SEARCH_AFTER`            | **PASS** — exact query returned `0` visible results     |
| `PRODUCTION_TOUCHED`               | **NO**                                                  |
| `CREDENTIALS_CREATED`              | **NO**                                                  |
| `EXTERNAL_CALLS`                   | **NO**                                                  |
| `ISSUE_1_CONNECTIVITY_TEST`        | **PASS**                                                |

### Temporary workflow lifecycle

The artifact was deliberately bounded and inert:

```text
search exact name (0)
  → create inactive local-only artifact
  → retrieve persisted workflow and compare
  → archive artifact
  → search exact name again (0 visible results)
```

The exact workflow name was `TEST__codex_mcp_connectivity`. Its persisted configuration had:

- one `n8n-nodes-base.manualTrigger` v1 node named `Manual start`;
- no connections;
- no credentials;
- no external calls;
- no tags;
- no folder; and
- no active version.

The workflow stayed inactive (`active: false`) throughout the test. It was never executed, activated, or published.

### Persisted readback verification

After creation, the workflow was retrieved again from n8n DEV and compared with the intended configuration. The re-read matched the exact name, one-node local-only graph, empty connection set, absence of credentials, inactive state, and absence of an active version. This persisted readback is the evidence for `PERSISTED_READBACK = PASS` and `CONFIG_MATCH = PASS`; creation output alone was not treated as proof.

### Archive semantics, not permanent deletion

The available MCP server did **not** expose a permanent workflow-delete operation. The artifact was therefore removed through `archive_workflow`, which returned `archived: true`. A subsequent exact workflow search returned zero visible results.

This is an archive/soft-removal result, not a claim that every historical record was physically erased. If permanent deletion is ever required, establish the supported DEV-only procedure and receive separate approval; do not infer a hard-delete capability from this evidence.

## Issue #1 acceptance-criteria evidence

| Issue #1 acceptance criterion                                                          | Evidence in this record                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official n8n Skills are installed and the current meta-skill is loaded before n8n work | Official Skills verification section and test result: **PASS**.                                                                                                                                             |
| DEV MCP is authenticated with minimum necessary permissions                            | OAuth-connected DEV MCP performed only the bounded read/safe-write lifecycle. Tokens and exact grant details are intentionally not recorded; expanded authority requires a separate least-privilege review. |
| DEV identity and capabilities are verified without displaying credentials              | DEV URL, 34 inspected capabilities, and sanitized test results.                                                                                                                                             |
| No PROD connection, credential, workflow, or data is exposed                           | `PRODUCTION_TOUCHED = NO`; no production endpoint was used.                                                                                                                                                 |
| Read and safe write connectivity use a non-production artifact                         | Exact pre-search, temporary inactive workflow, persisted readback, archive, and post-search evidence.                                                                                                       |
| Persisted DEV result is retrieved and compared                                         | Persisted readback verification section: **PASS**.                                                                                                                                                          |
| Setup, permissions, evidence, and removal procedure are documented                     | This document and the linked DEV runtime README.                                                                                                                                                            |

## Client revocation and removal procedure

Use this procedure only after confirming the target is `https://n8n-dev.innovaq-ai.com`. **Never apply it to PROD.** The documentation PR does not run any of these commands.

1. In the DEV n8n UI, open **Settings → Instance-level MCP → Connected clients** and revoke or remove the Codex client. This removes the server-side OAuth client authorization for the DEV instance.
2. On the Codex client that is configured for DEV, remove local authorization and configuration:

   ```bash
   codex mcp logout n8n-mcp
   codex mcp remove n8n-mcp
   ```

3. If the instance-level MCP server itself must be disabled, use only the protected DEV environment file. Set the following value in `infra/n8n-dev/.env` on the DEV host:

   ```dotenv
   N8N_MCP_ACCESS_ENABLED=false
   ```

4. Validate the DEV Compose configuration before applying it, then recreate **only** the DEV `n8n` service:

   ```bash
   cd /opt/linkedin-content-engine/infra/n8n-dev
   docker compose --env-file .env config --quiet
   docker compose --env-file .env up -d --force-recreate n8n
   ```

   Do not run `down --volumes`, broad Docker prune commands, `--remove-orphans`, or a command targeting PostgreSQL as part of this MCP disablement. `N8N_MCP_MANAGED_BY_ENV=true` makes the disabled setting persist across DEV n8n restarts.

5. Record a sanitized operator confirmation that the DEV connected client was removed and, if requested, that instance-level MCP is disabled. Do not paste client IDs, OAuth codes, tokens, cookies, or screenshots containing secrets into GitHub.

The full DEV infrastructure context, safe defaults for new deployments, and current callback exception are maintained in [infra/n8n-dev/README.md](../../infra/n8n-dev/README.md).
