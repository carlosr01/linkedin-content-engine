# Data contracts

JSON Schemas define the data allowed to cross workflow boundaries. They use JSON Schema draft 2020-12, reject undeclared fields at entity boundaries, and are validated with Ajv.

| Schema                           | Boundary                                           |
| -------------------------------- | -------------------------------------------------- |
| `source-record.schema.json`      | Normalized, provenance-preserving source material. |
| `content-candidate.schema.json`  | Candidate selected from a source for evaluation.   |
| `content-score.schema.json`      | Structured relevance and brand-fit assessment.     |
| `linkedin-draft.schema.json`     | Versioned draft, references, and factual claims.   |
| `approval.schema.json`           | Human decision for one exact draft version.        |
| `publication-result.schema.json` | Idempotent publication attempt and outcome.        |

Validate the schemas and their representative fixtures with:

```bash
npm run validate:schemas
npm test
```

Schema changes are API changes. Update affected prompt contracts, workflow documentation, fixtures, and migration notes in the same pull request.
