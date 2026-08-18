# Development

## Standard change flow

1. Update local `main` and create a short-lived feature branch.
2. Update product/specification, schema, prompt, or workflow contract as needed.
3. Implement the smallest focused change.
4. Run local validation and tests.
5. If n8n behavior changes, load current official n8n skills, inspect live capabilities, and test only in n8n DEV.
6. Re-retrieve the persisted DEV workflow, verify it, export it, and remove instance-specific or credential data.
7. Commit atomically using Conventional Commits.
8. Create a pull request with validation evidence and operational impact.
9. Resolve review and CI; never bypass failures.
10. Merge to `main`. Production deployment is a separate owner-approved operation.

Examples:

```text
feat(discovery): add RSS normalization contract
fix(approval): prevent duplicate publish requests
docs(architecture): document Telegram review loop
```

## Local commands

```bash
npm ci
npm run format:check
npm run validate
npm test
npm run ci
```

`npm run validate:workflows` provides repository-level syntax/shape checks. It is not semantic n8n validation and cannot replace DEV/MCP verification.

## Branch and commit policy

- Branches: `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...`.
- Keep commits atomic and messages conventional.
- Do not force-push `main` or rewrite shared branch history.
- Do not use `--no-verify` or disable checks to merge.
- Every material change reaches `main` through a pull request after the initial repository bootstrap.

## Recommended `main` protection

Configure these settings when the GitHub plan supports private-repository branch protection:

- require a pull request before merging, with zero required approving reviews for the solo-owner model;
- require the `Validate repository` status check to pass and require the branch to be up to date;
- require conversations to be resolved;
- block force pushes and deletion of `main`;
- do not enforce an impossible second-person approval;
- allow the repository administrator to recover from a broken rule while preserving the normal PR workflow.

If API configuration is unavailable on the current plan, apply this list manually after upgrading to a plan that supports protection on private repositories. Do not make the repository public just to obtain rules.

## n8n workflow contributions

Never author plausible-looking workflow JSON from memory. Work through official n8n skills and the live DEV environment, prefer native nodes, validate structure and semantics, test negative/idempotency paths, re-read the stored definition, then export it. Document any justified Code node.

## Test data

Use synthetic, explicitly safe fixtures. Do not copy production executions, credentials, personal messages, private source content, or complete webhook URLs into the repository.
