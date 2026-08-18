# Security Policy

## Reporting

Do not open a public issue containing a credential, token, private source, personal data, exploitable endpoint, or production detail. Report sensitive findings privately to the repository owner through an already trusted channel. Include a minimal reproduction and sanitized evidence; do not exploit the issue beyond what is needed to confirm it.

## Supported versions

Only the latest commit on `main` is supported during Phase 0. There is no deployed application in this phase.

## Baseline

- No runtime credentials belong in Git.
- OAuth refresh tokens must never enter commits or logs.
- External content and LLM output are untrusted.
- DEV and PROD access must remain separate.
- LinkedIn publication always requires explicit human approval for the exact draft version.

For the threat model, credential handling, logging, prompt-injection boundaries, and response process, see [docs/SECURITY.md](docs/SECURITY.md).
