---
id: architecture.principles.normative-language
type: architecture
title: Normative language and document authority
status: current
read_when:
  - interpreting requirements in architecture, engineering, product, or reference docs
  - deciding whether a documented rule is mandatory or advisory
  - encountering conflicting documentation
  - using examples to infer behavior not stated explicitly
summary: >
  Defines MUST, SHOULD, MAY, document authority, conflict handling, and no-extrapolation
  rules for Nevo SpecFlow documentation so humans and AI agents interpret requirements
  consistently.
related:
  - architecture.principles.enforceable-invariants
---

# Normative language and document authority

This document defines how requirements in Nevo SpecFlow documentation are interpreted.

## Requirement keywords

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative when
written in uppercase.

### MUST / MUST NOT

A **MUST** or **MUST NOT** requirement is an invariant or mandatory contract.

A change that violates it is invalid unless the authoritative rule itself is changed through the
appropriate architecture/product decision.

An implementation, review, instruction, example, prompt, or agent decision MUST NOT silently waive
a MUST/MUST NOT requirement.

### SHOULD / SHOULD NOT

A **SHOULD** or **SHOULD NOT** requirement is the expected default but permits a deliberate
exception.

A deviation MUST have a concrete reason relevant to the current change. The reason MUST be visible
in the implementation/review context when the deviation affects architecture, behavior, safety, or
maintainability.

"Faster", "easier", or "the agent chose it" is not sufficient by itself.

### MAY

A **MAY** requirement is explicitly optional. Choosing not to use the option is valid and requires
no justification unless another rule adds one.

## Document authority

Document status affects authority:

- **current** — authoritative for the scope the document owns;
- **draft** — proposal or working guidance; it MUST NOT override a conflicting current document;
- **deprecated/superseded** — historical context only; it MUST NOT be used as the current rule.

A more specific current document may refine a broader current document within its declared
ownership, but it MUST NOT contradict a broader invariant silently.

## Conflicts

If two authoritative current documents appear to conflict:

1. STOP the operation that depends on choosing between them;
2. report the conflicting rules and their document IDs;
3. do not select the more convenient interpretation;
4. resolve the conflict in documentation/architecture before proceeding with a state-changing
   implementation that depends on it.

A caller MAY continue work that is provably independent of the conflict.

## No extrapolation from examples

Examples illustrate an existing rule. They do not create new requirements.

A human or AI agent MUST NOT infer a new architecture rule, supported capability, transition,
permission, package boundary, or lifecycle guarantee solely because an example happens to show it.

Absence of a prohibition is not permission to violate an existing invariant.

## Authoritative ownership

When one document declares itself the canonical vocabulary, contract, or owner for a fact, other
documents MAY reference or explain that fact but MUST NOT define a competing value.

When software deterministically owns an observable invariant, prose MUST describe that invariant
consistently but MUST NOT create an alternative state machine or decision path.

## Imperative prose without a keyword

Existing imperative statements such as "Do not..." remain requirements in their local context.
When editing authoritative documents, prefer explicit MUST/MUST NOT for architecture and product
invariants so machine readers do not have to infer strength from prose style.
