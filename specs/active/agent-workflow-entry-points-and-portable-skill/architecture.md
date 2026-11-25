# Solution design

How the contracts C1 to C6 (backend.md) are built, reconciled with the architecture documents and
the code on this branch (2026-11-25). Each decision S1 to S9 lists the options weighed. The owner
took S1, S3, S5 and S7 in Design the solution; the rest are design choices recorded here, as the owner
asked.

## Reconciliation findings

- **F1. The first step depends on the archetype.** A Specification's workflow comes from its
  archetype's execution binding (`workflow/definitions/catalogue.ts`). `GET /api/specs/create-options`
  knows no archetype, so C6's single `firstStep` there cannot be right. The project Create form also
  asks for the method before the archetype (`CreateDemoForm.tsx`), so the method card cannot name the
  step. This is resolved by S7, and ux.md and C6 are corrected.
- **F2. Only the Engine commits.** ADR 0013 keeps the commit capability (`VersionControl.commits`)
  inside the Engine and unexported. C2's "install in the CLI package" can therefore not commit by
  itself. This is resolved by S3.
- **F3. The brief is known only at dispatch.** Sessions admission writes the Turn and its `request`
  entry in one transaction (`session-storage-and-lifecycle.md`). The capability, and with it the
  ad-hoc scope, is minted later, in `managed-invocation.ts`, just before `driver.start`. Dispatch
  intent is written through `beforeDispatch`. This is resolved by S5 and S6.
- **F4. The transcript is built from entries.** The UI renders `ConversationEntry` rows
  (`ManagedSession.tsx`), not `TurnSummary`. An entry's text is a 2 KiB `TextPreview` with paged
  content, and the brief can be up to 16 KiB.
- **F5. C1 matches the code.** `TransitionDescription` and `describeTransitions`
  (`workflow/operations/step-context.ts`) and `requiresOwnerConfirmation` and `effectAuthorityOf`
  (`workflow/definitions/effect-authority.ts`) exist. C1 reuses them and needs no change.
- **F6. No ad-hoc context read exists.** `gatherAgentContext` serves attempts only. C4's
  `readAgentSessionContext` is a new Engine read.

## Decisions

**S1. Skill source: a data file in the CLI package (owner).** The source is
`packages/specflow/skill/nevo-specflow.md`, at the package root as the Engine's `definitions/` is.
`packaging/bundle.ts` copies it to `dist/skill/` beside `bin.js`, and a missing file fails the bundle.
`src/skill/source.ts` finds it next to the module with fixed layouts (`.` for the bundle, `../..` for
the source tree) and nothing else, as `locateSeedDirectory` does.
Alternatives: inlining it into `bin.js` with an esbuild text loader (no lookup at run time, but a
second import path for vitest and source runs, unlike the definitions), or a file in the Engine
package (against the constraint that the CLI package owns the source).

**S2. Wrappers are rendered by the CLI.** `src/skill/wrapper.ts` renders a wrapper from the source and
the CLI version (`version.ts`), and classifies an existing file by C2's table. The body digest is the
sha256 of the UTF-8 body after the marker line, with line endings normalised to LF. "Newer" is a
semver comparison. A version that does not parse, such as a development build, never counts as newer,
so the digest rules decide. The two providers get the same wrapper today, and each is rendered
separately so that they can diverge later.
Alternative: the Engine renders them. It would have to know CLI text and the CLI version, which
ADR 0012's dependency direction does not support.

**S3. The Engine installs and commits the files (owner).** The Engine exports
`installProjectFiles(engine, { purpose: 'skill', files })`. Each file is `{ path, bytes, expected }`,
where `expected` is `{ absent: true }` or `{ sha256 }` as the CLI saw it when it classified the file.
In this order, it:

1. refuses a path outside the two `SKILL.md` paths the purpose allows;
2. refuses a link or a special file at the path or at any parent inside the Project Home;
3. refuses on a protected or not-allowed branch (`assertDefinitionsCommittable`'s predicate) before
   writing;
4. under the project control lock and `executionClaimAdmission(...).admitWrite()` (`SPEC_BUSY`), checks
   every `expected` again. A mismatch refuses the whole install with `PROJECT_FILE_CHANGED`, and the
   CLI says to run the install again;
5. writes, records a ledger entry with the new owner `{ kind: 'skill' }`, and commits with the new
   commit kind `skill-install` (subject `skill(install): N files`).

The paths still uncommitted from an earlier install are committed with it. With Git disabled, it
writes without a commit. The ledger owner `skill` joins `LedgerOwner`, `ledgerOwnerOfKey`, the
uncommitted holds and the manual-commit owners, so Close refuses while a wrapper is uncommitted, as it
does for definitions. Step 3 also refuses a detached HEAD or a repository with no commits with
`COMMIT_BLOCKED` before writing (D9). No new manual-commit scope (D10). The hold's owner union in the
contracts gains `skill`. The CLI's `commit --scope all` covers `skill` paths, while the HTTP `all`
leaves them out, as `resolveManualCommitTarget`'s `allowDefinitions` filter does for `definitions`.
The CLI Close report (`documents/uncommitted-groups.ts`) and the UI Close dialog
(`RepositoryBlockers.tsx`) show a **Skill wrappers** group whose remedy is `nevo-specflow skill
install`, which commits the leftovers.
Alternatives: the Engine owns the whole skill install, as definitions install does (against the
constraint that the CLI owns the source), or the CLI runs Git itself (against ADR 0013).

**S4. `init` makes one commit.** `init` writes the wrappers without committing, through the
lower-level `writeProjectFiles` that `installProjectFiles` is built on (as
`installProjectDefinitionFiles` is for definitions). It writes them after the definitions and before
the configuration marker. When initialization fails, it removes the wrappers it created, as it removes
a definitions folder it created. The commit after the marker covers the definitions and the wrappers
in one commit, with the new kind `project-init`. Its ledger record keeps each group under its owner
(`definitions`, `skill`). If that commit fails, the message names both recovery commands
(`definitions install --add-missing` and `skill install`). `init --no-skill` skips the wrappers.
Alternatives: two commits (this contradicts C3), or labelling the shared commit `definitions-install`
(it would misstate what it holds).

**S5. The ad-hoc brief is a new conversation entry (owner).** `ConversationEntrySchema.kind` gains
`'brief'`. Its `text` is an ordinary `TextPreview`, so the 16 KiB brief is paged through the existing
content reads. The store keeps entries as JSON (`entries.data`), so no store version is needed.
`TurnSummary` does not change. The stored Turn (`StoredTurn`) gains `brief?: { sha256, entryId }`
for recovery and tests.
Alternatives: a `brief` field on the `request` entry (the entry is written at admission and would be
revised at dispatch, and every reader of a request would see it), or a field on `TurnSummary` (the
transcript does not read summaries, see F4).

**S6. The brief is rendered at mint and stored with the dispatch intent.**

- `InvocationCapabilities.mint` returns `brief?: { text, sha256 }` on the ad-hoc branch of `scopeOf`.
  The agent-execution feature reads `readAgentSessionContext(specId)` and calls `renderAdHocBrief`
  (C4). It runs `grant.redact` over the text. When the read fails, the brief is rendered without the
  document list and says so. When rendering itself fails, mint fails, so the Turn is never dispatched
  without a brief (the existing not-dispatched path abandons the claim).
- `managed-invocation.ts` hands the driver the composed input: the brief, a line
  `## Message from the owner`, then the owner's message unchanged.
- The `dispatch-intent` store operation gains `brief?`. In the same transaction, the worker appends
  the `brief` entry, records `StoredTurn.brief` and emits one `conversation` change. A Turn that never
  reached dispatch intent sent nothing and has no brief entry. A Turn past it has exactly what was
  sent.
- Attempt Turns (their message already is the brief) and read-only Turns get none.
- The owner's message keeps its 128 KiB limit. The driver input may be up to the brief's 16 KiB more.

Alternative: render at admission, stored with the `request` entry. That would need a Sessions to
agent-execution port at admission, before the claim, and would store a brief that was perhaps never
sent.

**S7. The first step is per archetype, on the archetype catalogue (owner).** `ArchetypeInfoSchema`
gains `firstStep?: { id, title, agent: boolean }`. `toArchetypeCatalogue` fills it from the
archetype's execution binding: the workflow's first step, with `agent` true when the step is a work
step whose executors include `agent`. It is absent without a valid binding. `revision` stays the
admission token Create checks. The catalogue route's ETag (`catalogueEtag`) folds in a digest of the
`firstStep` facts, so a workflow change is not answered `304`. `create-options` does not change.

The form:

- The method step is shown when at least one selectable archetype has `firstStep.agent`.
- **With an agent** lists only those archetypes.
- The card copy names no step. The action and the "Creating…" progress name it once an archetype is
  picked.
- **Change the way of working** keeps the archetype when it still qualifies, and clears it otherwise.

The demo keeps its own behaviour, so aligning it stays out of scope.
Alternatives: a `firstSteps` map on `create-options` (the data would sit apart from the archetypes it
describes), or asking for the archetype before the method (the order would differ from the demo).

**S8. The start's request id is derived, and the agent choice is kept with the pending Create.** The
start's `requestId` is a UUID v5. The namespace is a fixed SpecFlow namespace constant, and the name
is `<createOperationId>:agent-start`. It is computed with Web Crypto SHA-1, so it matches
`RequestIdSchema`. The UI keeps the chosen provider, model and effort in the same client-side record
that already tracks the pending Create operation. When that record is gone (a reload in another
browser), nothing is started. The user lands on the Overview with the "did not start" notice, and Now
offers Run with agent.
Alternatives: a random id stored beside the operation (lost on another device, and a replay would
need the store anyway), or a server-side record (against D5, the Create request does not change).

**S9. The Engine adds `readAgentSessionContext`.** It returns `{ documents, documentTypes }` of the home
Specification in `AgentStepContext`'s shapes (`ContextDocument`, `ContextDocumentType`), with paths
relative to the Session's workspace. It reuses the document and type part of `gatherAgentContext`.
It is a read: no claim and no lock.

## Module map

| Area                                                                                                            | Change                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Engine `workflow/operations/step-context.ts`                                                                    | `ownerDecision` on `TransitionDescription` (C1), from `effect-authority.ts`.                                                           |
| Engine `workflow/agent/context/`                                                                                | `readAgentSessionContext` (S9).                                                                                                        |
| Engine `project-files/` (new), `version-control/commits/port.ts`, `specs/durable/ledger/`, `specs/uncommitted/` | `installProjectFiles` and `writeProjectFiles`, the commit kinds `skill-install` and `project-init`, the ledger owner `skill` (S3, S4). |
| Engine `specs/archetypes/projection.ts`                                                                         | `firstStep` (S7).                                                                                                                      |
| Contracts `documents/catalogue.ts`, `sessions/model.ts`, `documents/errors.ts`                                  | `ArchetypeInfo.firstStep`, entry kind `brief`, hold owner `skill` (S3, D10).                                                           |
| CLI `skill/nevo-specflow.md`, `src/skill/` (`source.ts`, `wrapper.ts`, `command.ts`), `packaging/bundle.ts`     | Source, wrappers, `skill show` and `skill install` (S1, S2).                                                                           |
| CLI `src/init/`, `src/agent-broker/routing.ts` (command table)                                                  | `init` and `--no-skill` (S4), placements (C3).                                                                                         |
| CLI `src/documents/uncommitted-groups.ts`                                                                       | The **Skill wrappers** group and its remedy (S3, D10).                                                                                 |
| Runtime `features/agent-execution/brief/render.ts`, `feature.ts`                                                | `renderAdHocBrief`, mint returns the brief (C4, S6).                                                                                   |
| Runtime `features/sessions/lifecycle/managed-invocation.ts`, `persistence/`                                     | Composed input, `dispatch-intent` with brief, entry and `StoredTurn.brief` (S5, S6).                                                   |
| Runtime `features/specs/create/catalogue-etag.ts`                                                               | ETag covers `firstStep` (S7).                                                                                                          |
| UI `features/specs/creation/`                                                                                   | Project method step, agent fields, chaining, request id (S7, S8).                                                                      |
| UI `features/tasks/execution/specification/RepositoryBlockers.tsx`, i18n                                        | The **Skill wrappers** Close group (S3, D10).                                                                                          |
| UI `features/sessions/managed/`                                                                                 | `brief` entry: a collapsed **SpecFlow brief** part above its Turn's request, with no copy action.                                      |

## Architecture documents to update

- `architecture.runtime.agent-step-execution`: the ad-hoc brief, its delivery and its entry.
- `docs/architecture/ai/session-history-and-events.md` and `canonical-session-turn-work.md`: the
  `brief` entry kind, and that it is written with the dispatch intent.
- ADR 0013's commit kinds as listed in its references, and the uncommitted-changes ledger owners
  (ADR 0018 references).
- `architecture.runtime.specification-create-lifecycle` (or `-create-options`): Create with an agent
  is a client chain of two calls.

No new ADR is needed. Each change extends an existing mechanism (an Engine commit kind, a ledger
owner, an entry kind, a catalogue field) without changing its rules.

## Open questions

None block Breakdown. To check while implementing, without changing the design:

- Whether the Codex `.agents/skills` loader accepts the same front matter as Claude's. If not, S2's
  per-provider rendering takes the difference.
- Whether the providers' input limit allows the owner's 128 KiB plus the brief. If it does not, the
  composed input is refused before dispatch (`PROVIDER_UNAVAILABLE`, not-dispatched) and the limit is
  documented.
