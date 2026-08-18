# Contributing

This private project uses a simple trunk-based workflow. `main` should always contain validated, reviewable artifacts.

## Workflow

1. Start from current `main` and create a `feat/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...` branch.
2. Keep the change focused. Update the relevant contract or decision record with behavior changes.
3. Run `npm ci` and `npm run ci`.
4. If n8n runtime behavior changes, load the official n8n skills, test in DEV, re-read the persisted workflow, and export the verified definition.
5. Open a pull request using the repository checklist. Resolve review and CI before merge.

Use Conventional Commits, for example:

- `feat(discovery): add RSS normalization contract`
- `fix(approval): prevent duplicate publish requests`
- `docs(architecture): document Telegram review loop`

Never include credentials or production data. Never use production as a development test environment. See [AGENTS.md](AGENTS.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full operating model.
