# Prompt contracts

These files define responsibilities, inputs, outputs, and safety constraints for future model calls. They are contracts, not final optimized prompt wording.

Every implementation must:

- bind a versioned prompt to a declared JSON Schema where structured output is feasible;
- treat sources and model responses as untrusted data;
- validate output before it reaches another workflow or external action;
- retain source identifiers needed to verify claims;
- record the model and contract version without recording secrets;
- fail closed and request manual review when grounding is insufficient.

Prompt changes that affect ranking, factuality, tone, or publication eligibility require fixtures and review. A model can recommend or draft; it cannot create a valid human approval.
