# Behaviour

The external skill's own scenarios are in skill.md, the surfaces in ux.md, and the contracts in
backend.md.

## Scenarios

- **Create with an agent.** The owner picks With an agent, a provider and a model. Create completes,
  then the agent's attempt of the first step starts in a fresh Session. The owner lands there and works
  with the agent, for example answering its requirements questions. The attempt ends like any E6
  attempt: finish proposal, attempt commit, Confirm when needed.
- **Agent start refused after Create.** The Specification exists. The owner lands on its Overview with
  the reason and uses Run with agent once the cause is fixed.
- **Ad-hoc Session.** The owner chats in a Specification Session and asks the agent to "execute the
  current step". The agent explains that it cannot do that in this conversation and that the owner uses
  Run with agent. It may still edit the home Specification's documents if asked.

## Rules

- **The bound archetype never switches.** An attempt that binds an archetype (for example `reviewer`)
  runs as it for the whole attempt. It MUST NOT switch (for example to `implementer`) because the
  content mentions other work. The portable skill does not choose or change the archetype either.
- **One step.** Every entry point does at most the current step. No surface reports a Specification as
  prepared because a step finished.
- **No implicit attempt.** An ad-hoc Turn never becomes an attempt, and a Session's historical Task
  association conveys no execution authority.
- **One contract.** The skill, the Create chaining and the briefs use existing Engine operations only.

## Edge cases

- The first step is not an agent's step, or the Specification gets no workflow: Create offers no agent.
- The provider becomes unavailable between the form and the start: the start is refused and the
  Overview explains it.
- An external CLI write while a managed agent Turn holds the project: `SPEC_BUSY`.
- An ad-hoc Turn on a Specification whose documents cannot be read: the brief is still sent without
  the list.

## Acceptance scenarios

- **A1. External skill, Runtime stopped.** With the installed skill, an agent finds the project and
  Specification through the CLI, creates a Specification, registers documents, drafts Tasks with
  owner-attributed commands, and reads `workflow context`. The skill and README show the trust
  statement.
- **A2. Finish on request only.** Asked to finish, the agent runs `workflow finish` as the owner. For a
  result `workflow context` marks as an owner decision, it asks first. A blocking gate or dependency is
  named, and the attempt stays active.
- **A3. External refusals.** A stale attempt, wrong workspace, missing document or unregistered file is
  refused with the Engine's diagnostic. `SPEC_BUSY` while a managed Turn holds the project, and the
  agent waits or asks.
- **A4. Skill delivery.** `init` writes both versioned wrappers from the shipped source.
  `skill install` updates an older generated one, leaves an unchanged one, and keeps an edited one
  unless `--force`. It never touches other skills. `skill show` prints the skill. No
  repository-private agent rules are needed.
- **A5. Managed brief (E6, confirmed).** A managed Claude or Codex attempt Turn works from the brief
  without native skills or MCP. A provider that cannot take the invocation-bound tools makes Run with
  agent refuse instead of downgrading to a chat.
- **A6. Ad-hoc guidance.** An ad-hoc write Turn carries the SpecFlow brief, shown apart from the
  owner's message. Asked to execute the step, the agent points to Run with agent. No attempt is created.
- **A7. Create with an agent.** Create lands in the first step's agent Session, and nothing reports the
  Specification as prepared. A refused start leaves the Specification, and Create never fails as a
  whole.
- **A8. No full preparation.** Asked to prepare a whole Specification, any agent offers one step. Tests
  tell a finished first step apart from a prepared Specification.
- **A9. Returned Task attempt (E6, confirmed).** A Task implementation attempt 2 gets its Task context
  and the failed Review's feedback as its handoff, finishes, and does not launch Review.
- **A10. Task drafts (E6, confirmed).** Drafts, dependencies and documents made in an attempt are
  visible at once. A Breakdown finish never touches owner-created drafts (D06, `materializeTasks`).
- **A11. Archetype stays bound.** A `reviewer` attempt stays reviewer when the content talks about
  implementation.
