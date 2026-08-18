# Validation scripts

| Script                   | Scope                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| `validate-config.mjs`    | Parses example YAML, checks expected shape, and enforces safety invariants. |
| `validate-schemas.mjs`   | Parses and compiles every draft 2020-12 JSON Schema with Ajv.               |
| `validate-workflows.mjs` | Checks future workflow JSON syntax and minimum repository export shape.     |
| `check-secrets.mjs`      | Detects and masks several obvious credential patterns.                      |

Run all static checks with `npm run validate` and the complete CI suite with `npm run ci`.

These tools are intentionally narrow. Workflow validation does not prove current n8n semantics; secret scanning is defense in depth, not a guarantee. Live n8n DEV validation and provider-native secret controls remain mandatory.
