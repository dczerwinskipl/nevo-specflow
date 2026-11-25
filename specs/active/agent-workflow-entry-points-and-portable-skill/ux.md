# UX

Two surfaces change: the project Create form (Create with an agent, D4 and D5) and the Session
transcript (the ad-hoc brief, D7). The rest of Create stays as `product.specflow.specification-creation`
describes it, and Run with agent stays as `product.specflow.ui.workflow-execution` describes it.

## Create with an agent (project mode)

- **Method choice.** The project Create form starts with the method step the demo already has: two
  cards, **With an agent** and **On my own**. With an agent says what happens: "Creates the
  Specification and starts an agent on its first step." The method step is shown only when at least
  one selectable archetype's first step is an agent's step (its executors include `agent`, D8).
  Otherwise the form keeps today's layout with no method step, and nothing shows disabled.
- **Archetypes with an agent.** With an agent lists only the archetypes whose first step is an
  agent's step. Each one names that step ("First step: <step title>"). **Change the way of working**
  keeps the name, workspace and agent choice, as in the demo. It keeps the archetype when it still
  qualifies and clears it otherwise.
- **Agent fields.** Provider tiles and the labelled Model and Effort fields, the same as the Run with
  agent dialog. There is no Work mode (an attempt always writes) and no note field. Provider facts come
  only from the provider registry, and unknown stays unknown. A provider that is not ready shows its
  reason and cannot be chosen. Without a ready provider, the card explains it and the choice falls
  back to On my own.
- **Action.** The primary action reads **Create and run with agent**, with the chosen archetype's step
  title beside it. While it runs, it shows "Creating…" until Create completes, then "Starting the
  agent on <step title>…". Cancel stays available only before
  Create is sent.
- **Success.** The user goes to the attempt's Session (`/sessions/:sessionId`) with the toast
  **Specification created · the agent is working on <step title>**. Nothing on any surface says
  "prepared", "ready" or "done" for the Specification.
- **Agent start refused.** This covers a dirty baseline, the project being busy, a provider no longer
  ready, or the start's answer being lost. The Specification exists, so the user lands on its Overview
  with a warning notice: "Specification created. The agent did not start: <Engine reason>." Now offers
  Run with agent, and its dialog explains the precondition. A lost answer shows "The agent may have
  started. Check again." and reads the projection before offering anything. The UI never sends a
  second start under a new request id.
- **Create itself fails.** Exactly as today. No agent start is attempted.

## SpecFlow brief in the transcript (ad-hoc Turns)

- An ad-hoc write Turn of a Specification Session shows the owner's message as they wrote it. Above it,
  in the same Turn, a collapsed part reads **SpecFlow brief** (`info` icon, quiet tone). Expanding it
  shows the brief text as sent. It is never shown as the owner's words and never offered for copy as
  their message.
- The part is shown only on Turns that carried it. A read-only or attempt Turn shows none. An attempt
  Turn's message already is its brief, as today.
- The brief copy says "the agent" and "Run with agent". It never says "turn", "claim" or "capability".

## Acceptance (UX)

- Create with an agent on an archetype whose first step is an agent's step goes to the Session with the
  toast, and the Overview's Now shows the agent working on that step.
- When no selectable archetype's first step is an agent's step (none has `firstStep.agent`), the method
  step is absent. When some do, **With an agent** lists only those archetypes.
- The Close dialog's uncommitted changes show a **Skill wrappers** group, with the remedy
  `nevo-specflow skill install`, while a wrapper is uncommitted.
- A refused start lands on the Overview with the notice and Run with agent, and the Specification is
  listed.
- An ad-hoc Turn shows the collapsed SpecFlow brief above the owner's unchanged message.
