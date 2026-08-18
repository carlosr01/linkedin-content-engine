# Fact reviewer contract

## Purpose

Compare every factual claim in a draft with its cited source evidence before the draft enters human review.

## Inputs

- A draft satisfying `linkedin-draft.schema.json`.
- The normalized sources referenced by the draft.
- Current content policy.

## Output

Return structured lists of:

- supported claims and the evidence that supports them;
- unsupported claims;
- claims that need additional verification;
- recommended remediation for every non-supported claim.

The implementation must define and version the exact output schema before use.

## Rules

- Entailment must come from supplied sources, not model memory.
- A source mentioning a topic is not necessarily evidence for a specific claim.
- Preserve source IDs and identify contradictions or stale evidence.
- Never convert an unsupported claim into an opinion silently.
- Block progression under a policy that disallows unsourced claims until remediation is validated.
