### Purpose and evidence

This is an evidence-gathering procedure for an already active responsibility, not a new
user-facing agent, autonomous delegation mechanism, or second task planner.

Use focused architecture discovery when a proposed change depends on existing infrastructure, lifecycle, shared components, data contracts, or cross-module boundaries whose suitability is not already established.

Start with the required observable behavior and authoritative architecture documentation. Inspect the owning public APIs, representative consumers, meaningful tests, and current implementation. Search by responsibility and interaction semantics, not just filenames. Avoid surveying unrelated packages merely to produce a broader report.

### Classify each needed capability

Record a compact capability-to-owner map. For each material requirement identify:

- the responsible module, layer, or authoritative contract;
- the concrete source of evidence (document ID, public symbol, test, or consumer);
- readiness: established and suitable, established but insufficient, missing, or uncertain;
- the consequence for the requested implementation and its verification.

A public method existing does not prove that its lifecycle, back/close behavior, data freshness, or failure semantics meet the requirement. Differentiate documented guarantees from implementation observations and assumptions.

### Choose the smallest sound technical direction

Prefer reuse of an already suitable contract. When insufficient, compare extension of its owner with a separate product-owned capability; identify the architectural decision needed rather than quietly putting a workaround into a downstream consumer.

Distinguish new semantics (owner decision or new contract) from local implementation mechanics (implementer discretion). Recommend separate foundational specification work only if it has coherent ownership and can be independently validated. Return any user-visible product ambiguity to the owning product/UX process.

### Handoff

Return facts and references, capability gaps, a recommended ownership/contract direction, dependency consequences, and only material unresolved decisions. Do not duplicate full documents or write an implementation plan here. Never claim a missing contract is ready because a mock or fixture demonstrates presentation.
