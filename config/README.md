# Configuration contracts

This directory contains non-secret examples for behavior that should be reviewable in Git. Copy an example to an environment-specific location outside the repository or load it through the chosen deployment process; never add credentials.

| File                          | Responsibility                                               |
| ----------------------------- | ------------------------------------------------------------ |
| `content-policy.example.yaml` | Editorial and publication safety policy.                     |
| `sources.example.yaml`        | Enabled content-source catalog and ranking hints.            |
| `runtime.example.yaml`        | Non-sensitive environment defaults and workflow identifiers. |

`npm run validate:config` parses every example, rejects unexpected top-level keys, and enforces the core human-approval invariant. A policy-threshold change is a material product decision and requires a pull request; the initial score of 75 is a starting hypothesis, not a scientifically established optimum.
