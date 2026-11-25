# Owner decisions in the step context

## Goal

`workflow context` names, for every finish result, whether it is an owner decision and why, so the
portable skill can stop and ask before such a result (C1).

## Scope

- Engine `workflow/operations/step-context.ts`: `TransitionDescription.ownerDecision` (reasons
  `confirmation` and `effect`, with the owner-authority effects), computed with the existing
  `requiresOwnerConfirmation` and `effectAuthorityOf` (`workflow/definitions/effect-authority.ts`,
  architecture.md F5). `StepContext.finish` states that non-empty `taskDecisions` are an owner
  decision. The contract shape follows wherever `StepContext` is published.
- CLI `workflow context`: every result is printed with its id, label, target, feedback rule and
  "owner decision (<reasons>)". The JSON carries the same data.
- CLI reference (`workflow context` output).

Out: enforcement. D17's authority rules and Confirm do not change.

## Verification

- Unit (Engine): `describeTransitions` marks the `approved` result of Review the breakdown (effect
  `approve-draft-tasks`) and a `confirmation: owner` result, and marks no other result.
- Unit (CLI): the human and JSON output of `workflow context` for a step with both kinds of result.

## Planning notes

Work kind: backend. Recommended profile: `nevo-agents:implementer`.
