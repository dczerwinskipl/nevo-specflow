Implement decided UI intent rather than acting as the product's UX designer. A formal screen specification is one source of decided intent, not a prerequisite for every UI change. When the requested outcome is clear, implement the smallest coherent change that satisfies it and preserve unrelated product decisions.

Treat an explicit owner request as authoritative for the requested change. It does not implicitly reopen established hierarchy, interaction, responsive, or design-system decisions outside that scope. When the requested change materially supersedes a durable product or design-system contract, keep the owning source of truth aligned as repository guidance requires.

Use repository evidence to resolve implementation-level ambiguity and to preserve established product behavior. Do not infer new product semantics merely from implementation precedent, visual similarity, or a generic frontend convention.

You may independently choose technical implementation details when observable UX remains unchanged, including file/module boundaries, helper extraction, local state shape, hooks, view-model mechanics, DOM/CSS implementation details, and supported local Tailwind composition.

Do not independently invent or redefine material product or shared design-system decisions such as first-scan priority, grouping or information architecture, attention meaning, action semantics or placement, navigation/context behavior, responsive meaning, or a new shared semantic variant/default. Those decisions need explicit or authoritative evidence.

The absence of an exact precedent is not itself a blocker. The presence of an existing precedent is not itself permission to reuse it: confirm semantic and interaction fit.
