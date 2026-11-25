# End-to-end acceptance and roadmap coverage

## Goal

The three entry points are verified together on the packaged product (A1 to A4, A6 to A8 of
behaviour.md), and the roadmap records what was delivered.

## Scope

- **A1 to A3, packaged CLI, Runtime stopped.** In a temporary project initialized by the packed CLI,
  run the command sequence the skill prescribes: find, inspect, create a Specification, register
  documents, draft Tasks, read `workflow context` with its owner-decision marks, and finish on request.
  Also cover the refusals the skill names: a stale attempt, a wrong workspace, a missing document, an
  unregistered file, and `SPEC_BUSY` while an agent Turn holds the project.
- **Skill text check.** Every command the shipped skill names exists in the CLI. The skill names no
  Runtime route and asks for no credential. The skill and the README carry the trust statement
  verbatim.
- **A4** end to end: `init`, then the skill install after a version bump and after a hand edit.
- **A6.** An ad-hoc write Turn (fake provider) carries the brief, the transcript shows the part, and no
  attempt exists afterwards.
- **A7, A8.** Create with an agent lands in the first step's Session, a refused start leaves the
  Specification, and no surface reports a finished first step as a prepared Specification.
- Docs: L131 and the Idea's outcomes in `ideas.roadmap-coverage`, marked delivered by this
  Specification.

## Verification

The acceptance tests above pass in CI. A gap found here is reported back to the Task that owns the
behaviour. It is not fixed inside this Task.

## Planning notes

Work kind: integration (verification across the Engine, CLI, Runtime and UI). Recommended profile:
`nevo-agents:implementer`. It depends on `init-installs-skill`, `transcript-brief-part` and
`create-with-agent` (the finish lists all three).
