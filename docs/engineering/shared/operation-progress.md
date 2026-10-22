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
6. **Tests.** Contract schema test; adapter test (stage to step, no leaked text); an HTTP test of
   the stream with the real operation; hook and component tests (events to checklist, fallback
   when the stream fails, abort on unmount); a story at 320 px.

## Rules

- Subscribe with the client-generated `operationId`; the Runtime waits for an operation that has
  not been reserved yet (see the API reference).
- On any stream failure show no checklist and carry on with the operation's own monitoring.
- Abort the stream when the owner stops needing it (finished, unmounted, another operation).
- Do not retry or poll the stream from the UI: the SSE client already reconnects with
  `Last-Event-ID` and the server answers with a fresh snapshot.
