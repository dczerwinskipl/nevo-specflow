---
id: engineering.shared.operation-progress
type: engineering
title: Adding live progress to a long-running operation
status: current
read_when:
  - an operation can run for seconds or minutes and the UI should show its steps
  - adding a kind to the operation progress stream
  - consuming operation progress in the UI
summary: >
  How the generic operation progress mechanism is layered (contracts registry, Runtime
  broadcaster and route helper, UI port, hook and checklist) and a recipe to add it to another
  operation: one feature route plus an adapter.
related:
  - reference.api.operation-progress
  - engineering.shared.async-and-lifecycle
  - engineering.shared.effects-and-io
---

# Adding live progress to a long-running operation

Progress is a best-effort **display** of an operation that already has its own durable truth
(journal, inspection endpoint). It is never an input to the operation's state, and a failing
stream must never fail or block the operation.

## Layers (one owner each)

| Layer      | Owner                                                              | Knows                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts  | `specflow-contracts/src/operations/`                               | event envelope, registry of kinds, step ids and typed result per kind                                                                                            |
| Engine     | the operation itself                                               | its own stages; exposes a read-only observer, never HTTP                                                                                                         |
| Runtime    | `specflow-runtime/src/features/operations/` and the kind's feature | shared: registry keyed by (kind, operationId) and `registerOperationEventsRoute`; feature: the route, its authorization, the adapter from stages to public steps |
| UI shared  | `specflow-ui/src/shared/operations/`                               | port (`OperationsApi.watchProgress(streamUrl)`), pure reducer, `useOperationProgress`, `OperationProgress` checklist; no operation kind and no route             |
| UI feature | the operation's feature                                            | the stream URL (next to its inspection URL in its API port), copy of the steps (typed `Message`s), where the checklist is drawn                                  |

## Recipe

1. **Contract.** In `operations/kinds.ts` add the step ids (a stable public vocabulary, not raw
   stages) and the typed result schema, then register the kind in `OPERATION_KINDS`. Add the
   `kind` to the tests in `progress.test.ts`. Never put paths, journal data or server text in an
   event; failures are a stable `code`.
2. **Engine.** Give the operation a read-only observer (see `onStage` of the Create flow): a
   synchronous callback with a minimal, path-free observation. It must swallow its own errors,
   so progress can never change the outcome.
3. **Runtime adapter and route.** In the kind's feature write one adapter that maps observations to
   `OperationProgressReporter` calls (`step`, `complete`, `fail`, `recoveryRequired`). Create is
   `features/specs/create/progress.ts`. Start it where the operation starts (it needs the
   `operationId` and the checklist of this run), `complete` with the same payload as the HTTP
   result, and `fail` in the catch with the typed code (`undefined` becomes `INTERNAL_ERROR`).
4. **Route.** Next to the operation's inspection endpoint call
   `registerOperationEventsRoute(app, {path, kind, authorize, registry})` (Create:
   `GET /api/specs/create/operations/:operationId/events` in `features/specs/create/endpoint.ts`).
   `authorize` is the same capability check as the inspection endpoint, so the route reveals
   nothing before it passes. There is no global operations route and no `kind` query parameter.
5. **UI feature.** Add the step labels to the feature's i18n namespace (pl and en), map them with
   `satisfies Record<StepId, Message>` so a new step cannot ship unlabelled, and render
   `<OperationProgress>` while the operation is running, with the hook
   `useOperationProgress({api, streamUrl, enabled})`, where `streamUrl` comes from the feature's
   own API port (`operationEventsUrl(operationId)`). Keep progress out of the operation's
   reducer: it is display state. Pass `placeholderRows` so the checklist does not move the page.
   Give an operation that takes seconds to minutes its own page (a route carrying the
   `operationId`, Create: `/specs/new/creating/$operationId`) rather than a panel under the form
   that started it: the form only stores the request and navigates; the page owns sending,
   watching and the outcome, and works from the id alone after a reload or a direct link.
6. **Tests.** Contract schema test; adapter test (stage to step, no leaked text); an HTTP test of
   the stream with the real operation; hook and component tests (events to checklist, fallback
   when the stream fails, abort on unmount); a story at 320 px.

## Rules

- Subscribe with the client-generated `operationId`; the Runtime waits for an operation that has
  not been reserved yet (see the API reference).
- On any stream failure show no checklist and carry on with the operation's own monitoring.
  The hook reports `lost` when the stream failed, dropped or ended without a terminal event, so the
  owner can switch its polling from a slow safety net to its regular backoff; a terminal event is a
  reason to read the inspection at once, never the outcome itself (Create:
  `watchCreateOperation.ts`, hints `live`, `terminal`, `lost`).
- Abort the stream when the owner stops needing it (finished, unmounted, another operation).
- Do not retry or poll the stream from the UI: the SSE client already reconnects with
  `Last-Event-ID` and the server answers with a fresh snapshot.

## Failure after acceptance, retry and navigation (Create)

- The journal has no failed state. A Runtime that saw a run fail after the reservation reports it
  from the progress registry (`peek`) through the inspection endpoint as
  `{ status: 'failed', code }` (stable code only, retained for the registry grace window). The UI maps
  the code with the same table as a refused request: a code that declares nothing was applied is a
  definite failure, any other code leaves the outcome unknown ("check the result").
- The stream's terminal `failed` code may be shown while monitoring (best effort, never twice: the
  inspection's conclusion replaces it); the synthetic `OPERATION_NOT_FOUND` says nothing.
- `begin()` of an id whose previous run finished (inside the grace window) starts a fresh run; only a
  still running entry is a concurrent replay.
- A retry that finds the operation still `reserved` is validated against the reserved plan first, so
  it gets the original rejection (4xx) instead of 202.
- Polling stops on 401/403 (the owner is told; the operation stays stored) and honours `Retry-After`
  on 429.
- Leaving never blocks while an operation is unfinished: the server finishes it and the stored
  operation (sessionStorage, per identity) is resumed when the user opens Create again (the form
  continues on the operation's page, replacing itself in the history). Unsaved edits of an idle
  form still ask before leaving.
- The form hands over with two stored items: the request that was sent (the operation) and the
  draft (what was entered: fields and workspace choice, plus the refusal to flag). The page
  releases the operation when the server refused it and keeps the draft, so "Back to form" restores
  the entries (consumed once, never in the URL); only an operation whose failure left the outcome
  open (a lost session) stays stored and is tried again on the page.
- A page opened by id alone (direct link) reads the inspection and shows what the server knows; a
  404 is "operation not found" and sends nothing, because there is no retained request to send.
