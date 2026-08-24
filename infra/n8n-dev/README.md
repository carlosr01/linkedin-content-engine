# Isolated n8n DEV

This directory defines the repository's isolated n8n DEV runtime. It is not a production deployment definition and must never be pointed at, connected to, or populated from production n8n.

No deployment has been performed as part of Issue #1. The stack starts empty: no workflows, no Telegram/LinkedIn/Gmail credentials, and instance-level MCP access disabled.

## Pinned images

- `docker.n8n.io/n8nio/n8n:2.35.7` — exact stable n8n release. On 2026-08-24, the official npm `stable` and `latest` dist-tags both resolved to `2.35.7`; `beta`, `next`, and `rc` resolved to the separate `2.36.6` prerelease line. The official [GitHub release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.35.7) is neither a draft nor a prerelease and was published on 2026-08-21. Do not replace this pin with `latest`, `stable`, `beta`, `next`, `rc`, or another floating tag.
- `postgres:16.15-alpine3.24` — exact official PostgreSQL container tag for the isolated DEV database.

Review release notes and test a version change in DEV before updating either image. Never update the image tag during an unrelated deployment.

## n8n security review (2026-08-24)

The official [n8n GitHub security-advisory feed](https://github.com/n8n-io/n8n/security/advisories) was reviewed after resolving the stable version. For the maintained 2.35 line, every issue below is fixed no later than `2.35.4`; the pinned `2.35.7` is above each relevant patched-version floor.

| Concern                                                        | Official advisory result                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git node command execution                                     | [GHSA-mwp5-2m32-r54h](https://github.com/n8n-io/n8n/security/advisories/GHSA-mwp5-2m32-r54h) affects `< 2.35.4`; fixed in `>= 2.35.4`.                                                                            |
| Cross-project Insights authorization                           | [GHSA-jmmj-93rg-6j39](https://github.com/n8n-io/n8n/security/advisories/GHSA-jmmj-93rg-6j39) affects `< 2.35.4`; fixed in `>= 2.35.4`.                                                                            |
| Credential access through inline sub-workflows                 | [GHSA-4r56-g65c-fm83](https://github.com/n8n-io/n8n/security/advisories/GHSA-4r56-g65c-fm83) affects `< 2.35.4`; fixed in `>= 2.35.4`. The affected creation/update paths included REST API, Public API, and MCP. |
| MCP workflow creation with cross-project credential references | [GHSA-vfrj-582q-mvcp](https://github.com/n8n-io/n8n/security/advisories/GHSA-vfrj-582q-mvcp) affects `< 2.34.1`; fixed in `>= 2.34.1`.                                                                            |

The review also checked every advisory whose 2.35 maintenance-line patch floor is `2.35.4`; none requires a patch newer than `2.35.7` as of the review date. A stable pin still requires a fresh advisory review before deployment or later upgrades.

## Architecture

```mermaid
flowchart LR
  Internet["Internet / future DEV MCP client"] -->|"HTTPS: operator-provided DEV hostname"| Traefik["Existing Traefik"]
  Traefik -->|"external proxy network, port 5678"| N8N["n8n DEV 2.35.7"]
  N8N -->|"private DEV backend network, port 5432"| Postgres["PostgreSQL DEV 16.15"]
  N8N --- N8NVolume["n8n DEV data volume"]
  Postgres --- PostgresVolume["PostgreSQL DEV volume"]
```

The PostgreSQL service is attached only to the internal `n8n_dev_backend` network. n8n is the only service attached to both that private network and the existing external Traefik network. No host port is published. The volume and private-network names are derived from the DEV-only `COMPOSE_PROJECT_NAME`, preventing accidental reuse of production resources.

This is V1 single-main-process mode: `EXECUTIONS_MODE=regular`, no Redis, no queue workers, and no webhook workers. n8n may use its built-in internal task runner for Code-node execution; that is not queue mode and does not add a separate container.

## Required environment variables

Create `infra/n8n-dev/.env` from `.env.example`. The repository ignores populated `.env` files. Keep the file owned by the deployment account with mode `0600`.

| Variable                           | Required value or rule                                                       | Purpose                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`             | `linkedin-content-engine-n8n-dev`                                            | Gives networks, volumes, and Compose resources a DEV-only prefix.                                                           |
| `TRAEFIK_NETWORK`                  | Operator-discovered existing external Traefik network                        | Lets Traefik reach only the n8n container. Inspect it before deployment; never create or alter it from this stack.          |
| `TRAEFIK_CERT_RESOLVER`            | Operator-discovered existing Traefik certificate resolver                    | Requests the DEV hostname certificate without changing Traefik itself.                                                      |
| `N8N_HOST`                         | Operator-provided DEV FQDN; for example, `n8n-dev.example.com`               | Canonical editor, webhook, and future MCP hostname. It must be confirmed and resolve to the intended VPS before deployment. |
| `N8N_PROXY_HOPS`                   | `1` for direct Traefik; adjust only if another trusted proxy exists          | Makes n8n interpret forwarded client information correctly.                                                                 |
| `POSTGRES_DB`                      | `n8n_dev` or another DEV-only name                                           | Dedicated database name.                                                                                                    |
| `POSTGRES_USER`                    | `n8n_dev` or another DEV-only role                                           | Dedicated database role.                                                                                                    |
| `POSTGRES_PASSWORD`                | New random DEV-only value                                                    | Database authentication. Never reuse a production password.                                                                 |
| `N8N_ENCRYPTION_KEY`               | New random DEV-only value; retain securely for the lifetime of this DEV data | Encrypts n8n credentials at rest. Never copy or rotate in the same operation as deployment.                                 |
| `N8N_INSTANCE_OWNER_EMAIL`         | DEV owner email                                                              | Pre-provisions the owner and prevents a public first-run claim screen.                                                      |
| `N8N_INSTANCE_OWNER_FIRST_NAME`    | DEV owner first name                                                         | Owner identity.                                                                                                             |
| `N8N_INSTANCE_OWNER_LAST_NAME`     | DEV owner last name                                                          | Owner identity.                                                                                                             |
| `N8N_INSTANCE_OWNER_PASSWORD_HASH` | DEV-only bcrypt hash, single-quoted in `.env`                                | Owner login. Plaintext is invalid and must never be stored.                                                                 |
| `N8N_MCP_ACCESS_ENABLED`           | `false` initially                                                            | Instance MCP remains off until a separate reviewed enablement step.                                                         |
| `EXECUTIONS_DATA_MAX_AGE`          | Default `168` hours                                                          | Bounds execution-data retention.                                                                                            |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT`  | Default `1000`                                                               | Bounds retained execution count.                                                                                            |
| `N8N_MEMORY_LIMIT`                 | Default `1g`                                                                 | Caps n8n memory consumption on the shared VPS.                                                                              |
| `N8N_CPU_LIMIT`                    | Default `1.00`                                                               | Caps n8n CPU consumption.                                                                                                   |
| `POSTGRES_MEMORY_LIMIT`            | Default `512m`                                                               | Caps PostgreSQL memory consumption.                                                                                         |
| `POSTGRES_CPU_LIMIT`               | Default `0.50`                                                               | Caps PostgreSQL CPU consumption.                                                                                            |

The Compose file also fixes these non-secret settings: PostgreSQL backend coordinates, `America/Lima` for both `GENERIC_TIMEZONE` and `TZ`, HTTPS public URLs, secure cookies, environment access blocked in nodes, access to n8n's internal files blocked, Git bare repositories disabled, regular execution mode, JSON console logging, bounded Docker logs, telemetry/personalization/templates/version checks disabled, community-package installation disabled, and MCP managed by environment.

The [official security environment-variable documentation](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security) defines both added settings. `N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true` explicitly preserves n8n's documented secure default and prevents file-capable nodes from reading the internal `.n8n` directory and configuration paths. `N8N_GIT_NODE_DISABLE_BARE_REPOS=true` removes bare-repository support from the Git node as additional defense in depth. It does not disable ordinary non-bare repositories, and this project's planned workflows do not require Git-node repository access.

## Prepare the DEV environment file

Run these commands only on the intended DEV deployment host or in an approved secret-management workflow. They create new values; they do not read production state.

```bash
cd /opt/linkedin-content-engine/infra/n8n-dev
umask 077
cp .env.example .env
chmod 600 .env

postgres_password="$(openssl rand -hex 32)"
n8n_encryption_key="$(openssl rand -hex 32)"
read -r -s -p "New n8n DEV owner password: " n8n_owner_password
printf '\n'
n8n_owner_hash="$(printf '%s' "$n8n_owner_password" | docker run --rm -i httpd:2.4.68-alpine3.24 htpasswd -niBC 12 "" | tr -d ':\r\n')"
unset n8n_owner_password

sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$postgres_password/" .env
sed -i "s/^N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=$n8n_encryption_key/" .env
sed -i "s|^N8N_INSTANCE_OWNER_PASSWORD_HASH=.*|N8N_INSTANCE_OWNER_PASSWORD_HASH='$n8n_owner_hash'|" .env
unset postgres_password n8n_encryption_key n8n_owner_hash
```

Edit the three owner identity fields and supply the operator-confirmed hostname, external Traefik network, and certificate-resolver names. Do not paste secrets into an issue, pull request, terminal transcript, or deployment log. The bcrypt value must remain single-quoted in `.env` so Compose preserves its `$` characters. Plaintext is not accepted: n8n validates the value as a bcrypt hash and fails startup when the hash format is invalid.

## Pre-deployment review

Do not deploy until this change has been reviewed and merged through the repository's normal pull-request flow. On the VPS, the following checks are read-only and do not inspect any n8n instance:

```bash
cd /opt/linkedin-content-engine/infra/n8n-dev
test "$(stat -c '%a' .env)" = "600"
traefik_network="$(sed -n 's/^TRAEFIK_NETWORK=//p' .env)"
test -n "$traefik_network"
docker network inspect "$traefik_network" >/dev/null
unset traefik_network
docker compose --env-file .env config --quiet
docker compose --env-file .env config --images
```

The required network preflight is `docker network inspect <TRAEFIK_NETWORK>` using the exact operator-discovered value. It is read-only. Do not create, delete, rename, or redefine that external network.

Before starting containers, confirm:

1. DNS for the operator-provided `N8N_HOST` points to the intended VPS.
2. The external network and certificate-resolver names match the existing Traefik installation; the values in `.env.example` are intentionally blank because they cannot be confirmed from the repository.
3. No Dokploy domain entry also injects a second router for the same service. This Compose file uses manual Traefik labels; choose one routing method, not both.
4. The VPS has capacity for the configured 1 CPU/1 GiB n8n ceiling and 0.5 CPU/512 MiB PostgreSQL ceiling, plus image, volume, and log growth.
5. `.env` contains only new DEV values and `N8N_MCP_ACCESS_ENABLED=false`.

## Exact deployment commands (after review only)

These commands create only this DEV stack. They do not restart, update, inspect, or modify production n8n or the Traefik/Dokploy containers.

```bash
cd /opt/linkedin-content-engine/infra/n8n-dev
docker compose --env-file .env config --quiet
docker compose --env-file .env pull
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=100 postgres n8n
n8n_dev_host="$(sed -n 's/^N8N_HOST=//p' .env)"
test -n "$n8n_dev_host"
curl --fail --silent --show-error "https://${n8n_dev_host}/healthz"
unset n8n_dev_host
```

`docker compose up -d` may create only these named resources:

- `${COMPOSE_PROJECT_NAME}-backend`
- `${COMPOSE_PROJECT_NAME}-n8n-data`
- `${COMPOSE_PROJECT_NAME}-postgres-data`
- the two Compose service containers

It joins, but does not create or alter, `${TRAEFIK_NETWORK}`. Never add `--remove-orphans`: if the Compose project name is accidentally shared, that flag can remove unrelated containers.

## MCP and inactive-workflow policy

The image supports n8n's instance-level MCP server and will advertise it using `N8N_MCP_BASE_URL=https://${N8N_HOST}`. The hostname is operator-provided and must identify only this DEV instance; no production MCP URL is configured. The server remains disabled because both `N8N_MCP_MANAGED_BY_ENV=true` and `N8N_MCP_ACCESS_ENABLED=false` are applied at every startup.

### n8n 2.35.7 environment-lock compatibility

The environment-managed design was verified against the exact `n8n@2.35.7` source, not inferred from current `master`:

- The [official MCP environment-variable documentation](https://github.com/n8n-io/n8n-docs/blob/75d9b62cad580de9457656eef5276f799f7e6fcc/docs/reusable-content/.gitbook/includes/self-hosting/configuration/environment-variables/settings-env-vars/mcp.md) defines `N8N_MCP_MANAGED_BY_ENV` and `N8N_MCP_ACCESS_ENABLED`; the former reapplies the latter at startup and locks the matching UI control.
- The exact tag defines and validates [`N8N_MCP_BASE_URL`](https://github.com/n8n-io/n8n/blob/n8n%402.35.7/packages/cli/src/modules/mcp/mcp.config.ts#L31-L47) as an HTTP(S) public base URL for the instance-level server.
- In the tagged UI, [`mcpManagedByEnv` disables only the MCP toggle](https://github.com/n8n-io/n8n/blob/n8n%402.35.7/packages/frontend/editor-ui/src/features/ai/mcpAccess/SettingsMCPView.vue#L52-L55). Once MCP is enabled in a separately approved step, the [Allowed Callback URLs row](https://github.com/n8n-io/n8n/blob/n8n%402.35.7/packages/frontend/editor-ui/src/features/ai/mcpAccess/SettingsMCPView.vue#L304-L316) is gated by `mcp:manage`, not by the environment lock.
- The tagged REST controller independently protects [MCP enable/disable settings](https://github.com/n8n-io/n8n/blob/n8n%402.35.7/packages/cli/src/modules/mcp/mcp.settings.controller.ts#L29-L47) from UI/API changes when managed by environment, while [Allowed Redirect URI reads and writes](https://github.com/n8n-io/n8n/blob/n8n%402.35.7/packages/cli/src/modules/mcp/mcp.settings.controller.ts#L61-L79) remain available to an authenticated principal with `mcp:manage`.

Conclusion: keep `N8N_MCP_MANAGED_BY_ENV=true`; it locks MCP access to the reviewed environment value without preventing an administrator from editing Allowed Redirect URIs after MCP access is separately enabled. The caveat is sequencing: the callback-URL controls are visible only while MCP access is enabled, so the approved future operation must enable MCP and immediately save an explicit trusted redirect allowlist before connecting Codex. This review does not perform that operation.

The owner variables are also supported by the exact tag and the [official owner environment-variable documentation](https://github.com/n8n-io/n8n-docs/blob/75d9b62cad580de9457656eef5276f799f7e6fcc/docs/reusable-content/.gitbook/includes/self-hosting/configuration/environment-variables/settings-env-vars/instance-owner.md). `N8N_INSTANCE_OWNER_MANAGED_BY_ENV=true` reapplies the DEV owner identity on startup. `N8N_INSTANCE_OWNER_PASSWORD_HASH` is mandatory and must match bcrypt format; a plaintext password is invalid. This fail-closed, environment-managed owner model is appropriate for an isolated DEV instance because it prevents an unclaimed public first-run screen without placing a real identity or password in Git.

After deployment and a separate security review:

1. Sign in as the pre-provisioned DEV owner and confirm the instance has no connected MCP clients, workflows, or third-party credentials. Keep MCP disabled while making this initial check.
2. After explicit approval for the MCP setup step, change only `N8N_MCP_ACCESS_ENABLED=true` in the host's protected `.env`, then run `docker compose --env-file .env up -d n8n`.
3. Immediately open **Settings > Instance-level MCP > OAuth settings > Allowed Redirect URIs**, select the trusted-URLs mode, and save the exact approved client callback URLs. In n8n 2.35.7 this section is visible only while MCP access is enabled. Do not connect a client until the allowlist is saved.
4. Prefer OAuth and grant the coding agent only the read and safe workflow-edit capabilities required by Issue #1. Do not grant production access or share an all-purpose token.
5. Connect the client to the DEV URL, verify instance identity and capabilities without printing credentials, and create only a clearly named non-production test artifact.
6. Keep every created/imported workflow unpublished (inactive). Do not call `publish_workflow`, enable a trigger, or add Telegram, LinkedIn, or Gmail credentials.
7. Retrieve the test artifact again, compare its persisted definition with the intended safe draft, record sanitized evidence, and then remove or archive it as approved.

Those live MCP steps are intentionally not performed by this infrastructure-only change.

To disable MCP, set `N8N_MCP_ACCESS_ENABLED=false` and re-run `docker compose --env-file .env up -d n8n`. Then revoke connected OAuth clients in **Settings > Instance-level MCP**. Disabling at the environment layer is reapplied on every restart.

## Operations and removal

Routine status and logs:

```bash
cd /opt/linkedin-content-engine/infra/n8n-dev
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=200 postgres n8n
```

Stop without deleting data:

```bash
docker compose --env-file .env down
```

`docker compose down --volumes` permanently deletes the DEV n8n and PostgreSQL volumes. Run it only with explicit approval, after verifying the Compose project and backup/retention requirement. Never use broad Docker prune commands on the shared VPS.

## Risks to the existing VPS

- **Resource contention:** image pulls, PostgreSQL, executions, and retained data consume shared CPU, memory, disk, and I/O. Limits and log rotation reduce but do not eliminate this risk; Docker volumes can still fill the disk.
- **Routing collision:** a duplicate hostname/router label or an incorrect Traefik network/certificate-resolver name can cause routing or certificate failures. The router/service names are DEV-specific, and no host port is published.
- **Proxy trust mismatch:** `N8N_PROXY_HOPS=1` is correct only when Traefik is the sole trusted proxy. A CDN or extra proxy requires deliberate recalculation; too many trusted hops can allow spoofed forwarded headers.
- **First-owner exposure:** an empty public n8n instance can be claimed. This stack requires a pre-provisioned owner and bcrypt hash before it can render successfully.
- **Secret loss or reuse:** losing/changing `N8N_ENCRYPTION_KEY` makes stored DEV credentials unreadable; reusing the production key destroys environment separation. Back up the DEV key securely outside Git.
- **Shared proxy network visibility:** n8n must join the external Traefik network, so containers already on that network may reach its port 5678. PostgreSQL remains isolated on the internal backend network.
- **Outbound side effects:** credentials or active workflows added later could call external providers. The empty instance has no Telegram, LinkedIn, or Gmail credentials, MCP is off, and the operating rule is that workflows remain inactive until explicitly reviewed.
- **Image change:** even exact tags should be pulled and reviewed deliberately. Do not run unattended image updaters against this stack.
- **Destructive operator commands:** `down --volumes`, Docker prune operations, or reusing the project name can delete or collide with data. The documented deployment path avoids them.
