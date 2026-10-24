---
id: reference.api.specification-creation-demo
type: reference
title: Specification creation demo integration contract
status: current
scope: specflow
areas:
  - ui
  - runtime
tags:
  - demo
  - specification
  - session
read_when:
  - implementing or testing the temporary Specification creation demo
summary: >
  Temporary Runtime-owned in-memory integration for creating demonstration Specifications,
  documents and allocated Session placeholders without real provider or worktree execution.
related:
  - reference.api.specification-workspace
  - product.specflow.ui.data-loading-and-integration
  - ideas.specflow-ui.screens.specification-creation
---

# Specification creation demo integration contract

**2026-10-18 approved demo implementation.** The owner authorized the accepted mock iteration,
including document folders and file import. Workspace and Git choice follows the target-aware create contract below ("Gdzie chcesz pracować?").
The screen contract `ideas.specflow-ui.screens.specification-creation` owns presentation; old screen
state and composition impose no compatibility requirement. This integration is bounded process-memory
support for the connected product demo, with no real Git, worktree, filesystem or provider execution.

This contract authorizes only the explicitly selected Runtime `dataMode: demo`. It is a test/demo
adapter, not the future project creation API. Project mode MUST NOT register these endpoints, return
these fixtures, or make creation available. The UI determines mode through the existing Runtime info
API; hiding controls is additional presentation, not the enforcement boundary.

## Ownership and lifetime

`configureRuntimeApp` builds one process-memory demo environment (`createDemoEnvironment` in
`packages/specflow-runtime/src/demo/`) and wires it into the seeded repositories, catalogue, document
source and Session reference owner (`createDemoRuntime`). The shared state lives in `demo/state.ts`;
operations and routes are owned by the feature modules: `features/documents/demo/` (documents),
`features/sessions/demo/` (Sessions), `features/specs/demo/` (Create, options, operations,
catalogue). `registerDemoRoutes` registers them all under `/api/demo/**`.
Do not add a browser store or a second catalogue for newly created resources. Preserve seeded samples;
new Specifications, their explicit document manifests/bodies and their Sessions are visible through
the existing Overview, Workspace, document and Session-reference adapters. Do not fabricate a `spec`
document or a current execution to make a new resource appear in an existing read model.

State lasts for one Runtime app instance: browser refresh, navigation and reconnect retain it;
Runtime restart resets it to seeds. Separate app instances are independent. No localStorage,
filesystem writes, Git operation, provider invocation, billing, execution queue or AI Turn is part of
this increment. No reset control is needed in product UI; tests construct a fresh app/store.

Created documents and Sessions belong to their Specification. Every lookup/update checks the supplied
Specification and resource pair. Unrelated IDs return not found, never another Specification's data.
Use fresh stable opaque resource IDs, independent of titles. Session configuration is a snapshot;
changing a later setup cannot mutate an existing Session. An allocated placeholder is quiet, with no
Task or current execution, and remains openable from that Specification's Sessions list.

## Temporary transport

Implement typed schemas in a dedicated `@nevo/specflow-contracts` demo export and typed UI API over
the existing application HttpClient. No raw fetch, local success fallback or Storybook fixture import
in connected routes. Names below are the temporary contract, not a production API commitment.

| Method | Path                                            | Result                                                                 |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/demo/specification-creation`              | Preparation catalogue and availability                                 |
| POST   | `/api/demo/specifications`                      | Create Specification and its selected document set                     |
| POST   | `/api/demo/specs/:specId/sessions`              | Allocate a placeholder in the Specification place fixed by Create      |
| GET    | `/api/demo/specs/:specId/sessions/:sessionId`   | Placeholder identity, configuration and context summary                |
| POST   | `/api/demo/specs/:specId/documents`             | Create documents (from a template or content) and folders in one batch |
| POST   | `/api/demo/specs/:specId/folders`               | Create a document folder                                               |
| POST   | `/api/demo/specs/:specId/document-operations`   | Rename, move, delete or classify a document or folder                  |
| PUT    | `/api/demo/specs/:specId/documents/:documentId` | Save a text document with a revision precondition                      |

The document reads are not demo routes: the demo Runtime serves the real `GET /api/specs/:specId/document-tree`,
`GET /api/specs/:specId/documents/:documentId` and `GET .../raw` routes from its in-memory data, with the shapes,
headers and error codes of [the documents contract](specification-documents.md). The writes above emulate the D4
operations of that contract (which the project Runtime does not serve yet) with its schemas
(`@nevo/specflow-contracts/documents`, re-exported under demo names).

Catalogue accepts optional `specId` query context for an existing Specification. After `spec.view`
authorization it returns that Specification's confirmed current location; an unknown Specification
returns 404. Without this query it returns the project preparation location. Query cache identity
includes this scope. Confirming `current` for an existing Specification retains its confirmed
location, including a simulated location retained after allocation failure; it never silently resets
the Specification to the project directory. Additional Session setup shows that confirmed location
read-only. It does not offer a new worktree or introduce an unapproved location-change flow.

All responses use `Cache-Control: no-store` and existing authenticated Runtime origin/rate-limit
policy. Catalogue requires Specification create or Session create permission. Creation requires
`spec.create` at the demo project scope; Session allocation requires `spec.view` and `session.create`
at the target Specification scope; detail requires `spec.view` and `session.view` at the resolved
Session scope. Document save requires `spec.manage` at that Specification. Existing read adapters
retain existing authorization filtering. Do not bypass authorization because this is demo mode.

The catalogue is the real `ArchetypeCatalogue` (`revision`, `documentTypes`, archetypes with an integer
`version`, `requirements` and `always`/`optional` templates) resolved by the Engine's own catalogue rules: the
three built-ins exactly as the Engine ships them plus one demo-only owner archetype (`cross-module`, which
requires a `decisions` document), and `defaultArchetypeId`. The demo-only part adds the demo
project/current location, provider identities/marks/version/access/availability, and models and supported
effort/mode choices. Workspace, branch pattern and worktree availability come from create-options, not from the
catalogue. Include selectable Codex and Claude fixtures; an unavailable
adapter; explicit synthetic model names. Unknown metadata stays unknown. Model selection starts
empty. Dependent choices clear when no longer valid. The catalogue is stable within the app instance.
Fixtures must be labelled demo; they make no statement about installed providers or actual quotas.

Create input is the real `CreateSpecRequest` with a required client-generated `operationId` (UUID): trimmed
nonempty title, optional goal and slug, catalogue revision, archetype id and integer version, optional
`optionalDocumentIds`, `addedDocuments` (`{path, type?, content}`, no title) and `folders`. The documents are
built by the Engine's scaffold (template selection and rendering, registered id allocation, path rules and Create
limits): a stale revision or archetype version answers 409 `CATALOGUE_STALE`, an unknown archetype or optional
template 422 `ARCHETYPE_UNKNOWN`, a bad or conflicting path 400 `DOCUMENT_PATH_INVALID` / 409
`DOCUMENT_PATH_CONFLICT`, a limit or an added type that cannot be registered 400 `DOCUMENT_OPERATION_INVALID`.
Success returns `specId` (a demo id, not a UUID) and the registered `documentIds` in manifest order (`overview`
first). The write is atomic: failure creates none. Display titles are derived (first H1, else the file stem).

Create is atomic and also fixes the Specification place from its `target` (see "Workspace target and create-options"): there is no
separate workplace stage and no "new branch without worktree". The place is a simulated worktree for linked workspaces, the project
location for the primary one. Later Sessions reuse that place. A simulated place MUST visibly say it is simulated and MUST NOT imply
real Git work. If Session allocation fails after Create, the UI keeps the Specification and retries only the Session stage.

Session input consists of fresh `requestId`, catalogue revision, provider/model, supported effort
override or provider default and supported mode. It no longer accepts a location choice or
preparation token. Profile is fixed demo Spec Writer, separate from provider identity. No user prompt is
accepted. Validate catalogue, provider readiness and the target Specification's confirmed place
before allocation. Scoped lookup/authorization cannot expose or use another Specification's location.
The result is `sessionId` plus an immutable snapshot of the confirmed place. Allocation never prepares
a worktree or mutates the Specification place. Its failure leaves the created Specification intact for retry.

All POST operations are idempotent within the app instance by authenticated identity, operation,
Specification scope where relevant, and `requestId` (Session allocation) or `operationId` (Create and every
document write). Replaying identical input returns the original
resource/result or retries only an incomplete stage; changed input under the same key returns conflict.
Input fingerprint recursively includes all fields, including branch, nested import paths and file content. Two intentional additional Sessions use
different keys. Pending UI blocks duplicate clicks, but Runtime owns lost-response/retry correctness.
After partial success, retry only the failed stage: Create is never repeated after it succeeds, and
preparation is never repeated after it succeeds. A Session keeps its immutable configuration/location
snapshot even if future demo catalogue data changes.

Session detail contains identity, Specification owner, selected configuration, simulated/current
location, and a read-only context summary (project, Specification, archetype/documents and role/project
instructions). It contains no fabricated human message, AI response or Turn. The UI retains a local
unsent composer draft per Session across Documents round-trips, panel/focus changes and mobile Back
for the current application visit; send stays unavailable with an explanation. This draft is owned
above changing panes/routes, not by a composer whose unmount would erase it. No browser persistence
or recovery after full reload is promised for unsaved UI drafts.
Opening or reopening the Session never invokes an agent. Future provider prompt construction is
deferred; do not build a speculative prompt protocol now.

Document creation uses the contract's `CreateDocumentsInput`
(`{operationId, documents: [{path, type?, templateId | content}], folders?}`, at most ten files and 100 folders);
folder creation uses the demo body `{operationId, path}` (the contract names the route but not its body). Both
answer the contract's `DocumentOperationResult` (the created documents with their ids, the complete folder list,
`committed`, `commit`). A template entry renders a template of the Specification's archetype and is registered
with its type unless `type` says otherwise; a content entry without `type` is created unclassified (derived `u-`
id). Created files are `md` or `txt`. Paths follow the Engine's portable path rules; collisions are
case-insensitive and nothing existing is overwritten. The whole batch validates before any change.

Every Specification, created or seeded, has one in-memory document directory (registry, files, folders), so
every write applies to seeded Specifications too. The Workspace documents collection lists the registered
documents whose file exists (like the project Runtime) plus the folder list. The Runtime restart clears every
change; browser refresh retains committed data.

Save input is the contract's `SaveInput` (`operationId`, content, `expectedRevision`); the result is `SaveResult`
(`operationId`, new `revision`, `committed`, `commit`). A stale revision answers 409 `DOCUMENT_REVISION_CONFLICT`
without overwriting; a non-editable file 415 `DOCUMENT_NOT_EDITABLE`. Template preview remains read-only before
creation. An optional demo commit latency (`documentCommitLatencyMs`, default 0) makes a write hold the
Specification busy: the tree reports `busy` and other writes answer 409 `SPEC_BUSY`.

Use existing 400/401/403 conventions. Every document write and read answers the contract's
`{ error, code, details? }` with the codes of the documents error table. Demo-only error bodies remain for the
non-document stages: `demo_specification_creation_failed`, `demo_session_allocation_failed`,
`demo_catalogue_stale` and `demo_request_conflict` (Session allocation), so recovery is not guessed from status.
Transport schema/code owns precise TypeScript field representation and bounds; maintain these semantics.

## Failure fixtures and freshness

Tests inject deterministic one-shot failures into the app-owned demo dependency, before create,
Session allocation or a document write (the `save` stage refuses the write with 409 `COMMIT_BLOCKED`,
nothing written). Do not expose a product failure dropdown or accept
failure instructions from ordinary request bodies. A failed stage can succeed on retry with the same
key; completed effects are never repeated. A lost successful HTTP response is tested by replay.

After creation invalidate Overview and that Specification Workspace; after allocation invalidate its
Workspace/Sessions projection and read its specific Session detail. After save update/invalidate only
that document body and its relevant Workspace metadata. Preserve independently loaded details and
unrelated Specifications. Local draft/selected file/Secondary navigation are UI state, not Runtime data.

## Replacement obligations

Production creation/storage, archetype catalogue, provider capability/readiness, actual Worktree
preparation/assignment and Session lifecycle/Turn execution remain separate prerequisites. This demo
does not settle their durable command/event/protocol design. Future integration replaces the explicit
demo API adapter and Runtime dependencies with those owning capabilities, retains approved UX and
read ownership, and removes demo-only affordances. Do not enable this transport in project mode as a
shortcut or treat passing demo tests as production readiness.

## V4 implementation verification boundary

Existing demo transport/authentication, process-memory resource ownership, revision preconditions and
idempotency remain reusable. The previous creation component state, document dual-preview, selector
placement, route-driven full-Primary default and per-Session worktree effect do not. Rebuild the UI
journey from accepted v4; legacy links may redirect when useful but cannot dictate the new interaction.

Contract/store/Runtime tests cover manual and AI preparation, branch validation, project-mode denial,
identity/specification isolation, duplicate/lost-response replay, preparation failure with retained
Specification, Session failure with retained preparation, immutable Session snapshots, and additional
Session reusing the same place. UI/browser verification covers the accepted three screens with real
nonempty documents plus Empty, full editing and both drafts surviving mobile/route/focus transitions.
Compare rendered application screenshots and actual scroll ownership to the accepted mock and Nevo
components. Passing the old demo tests alone is insufficient for acceptance.

Demo ingest uses scoped Fastify body limits: **16 MiB** for specification creation and document batches, **2 MiB** for document save. The content limits are the Engine's (1 MiB of added content at Create, 1 MiB per saved text); the body limits leave room for JSON escaping; other Runtime/authentication endpoints retain their existing limits. The current UI imports up to 10 files per post-create batch, with 500-character joined paths; Create no longer exposes file addition or import. Legacy optional document payloads remain compatibility capabilities rather than current Create UI. Larger imports can be added as subsequent batches after creation.

## Owner v4 authoring extension (bounded demo)

The demo catalogue exposes `defaultArchetypeId` and no `workflow` (the real backend omits it too). The creation
UI sends the optional templates ticked in its Archetype section as `optionalDocumentIds`: the preselected ones
start ticked, and the user may untick them or tick others before Create.
Provider fixtures expose `connection: unknown`, a demonstration `profile`, and `quota.state: unknown`;
no real account, subscription, usage value, unit or measurement window is fabricated.

The document tree is the real `DocumentTree` (`GET /api/specs/:specId/document-tree`, `spec.view`), projected
by the Engine's own tree projection from the in-memory directory: registered and unclassified documents (`kind`,
`mediaType`, `size`, `revision`, `protected` only for `overview`, `editable`, `satisfiesRequirement`), dangling
entries, completeness, issues and per-action availability with an `ActionReason`. Every write action the
project Runtime reports as `not-implemented` is available in the demo (`busy` while a write commits); stronger
reasons (`protected`, `root`, `archived`, the branch policy) are kept. The seeded Specifications show every
state: `admission` (the showcase: registered documents of several types, an unclassified file, an empty folder),
`security` (the demo-only `cross-module` archetype with its `decisions` requirement unmet, an unclassified file),
`review` (an image, a binary file and a dangling `ux` entry), `packaging` (a protected branch: writes refused
with 422 `BRANCH_PROTECTED`, reason `branch-protected`), `providers` (a `json` text file that is not editable),
`localization` (an overview only) and `archived-shell` (archived: writes refused with 409 `SPEC_ARCHIVED`).

`POST /api/demo/specs/:specId/document-operations` requires `spec.manage`. Input is the contract's
`DocumentOperationInput` (`operationId`, `action: rename|move|delete|classify`, `kind: document|folder`,
`documentId` or `path`, `name`, `targetFolder`, `type`, `expectedRevision`). Documents use `documentId` and their
current revision; folders, and a dangling entry, use `path`/`documentId` and the tree revision. Rename takes a
leaf `name`; move takes an existing `targetFolder` (empty string means root); classify takes a catalogue `type`
and registers an unclassified file under an allocated id (`DOCUMENT_ALREADY_CLASSIFIED` for a registered one).
Deleting a dangling entry removes its registration. The overview cannot be renamed, moved or deleted
(`DOCUMENT_PROTECTED`); the root cannot be changed. Registered ids stay stable across rename/move; an unclassified
file's derived `u-` id changes with its path and after classification, and the result's `documents` carry the
new ids. Result: the contract's `DocumentOperationResult`. Replaying the same operation returns the same result;
changing its input under the same `operationId` answers 409 `DOCUMENT_OPERATION_CONFLICT`.

Mutation commits are atomic within this one in-memory Runtime; no filesystem/Git transaction is implied.
Workspace projections read the new registry directly. Allocated idle Session context document paths are
refreshed after every change of the file set (Session configuration remains a snapshot), so the placeholder
context does not retain removed or obsolete paths. UI must invalidate its document tree, Workspace, content and
affected Session-detail queries after an acknowledged change.
The existing 16 MiB batch and 2 MiB save request limits remain unchanged.

## Workspace target and create-options extension (demo)

**Demo schemas are the real create contract.** `DemoCreateOptionsSchema` and the two target schemas
(`DemoExistingTargetSchema`, `DemoNewWorktreeTargetSchema`, `DemoCreateTargetSchema`) are re-exports of the
real `CreateOptionsSchema` and target schemas from `specs/create.ts`; an equivalence test pins them, so
switching to the real Engine needs no mapping. The remaining demo-only schemas (for example
`DemoOperationStatusSchema`) use the real field names.

| Method | Path                                             | Result                                                                                                                                              |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/demo/specs/create-options`                 | `DemoCreateOptions` from the in-memory workspace registry                                                                                           |
| POST   | `/api/demo/specifications`                       | Create; accepts `operationId` and `target`                                                                                                          |
| GET    | `/api/demo/specifications/operations`            | `OperationListResponse`, the same contract as `GET /api/specs/operations` over the demo state (query `status`, `limit`; `ETag`/304; `View` per row) |
| GET    | `/api/demo/specifications/operations/:id`        | Operation status: `completed`, `in-progress`, `recovery-required`, `not-started`, `failed`                                                          |
| GET    | `/api/demo/specifications/operations/:id/events` | Live progress (SSE), the shared operation-progress stream of the real Runtime; requires the `Create` capability                                     |

The operations list and the status read honour the `demoScenario` query like the other demo routes;
an unknown scenario answers 400.

Create-options require `spec.create` at the demo project scope. The default registry is a realistic
happy path: primary `develop` (0 specs, not Nevo-managed, no pin), linked `feature/platform` (2),
`feature/payments` (1, dirty: selectable, not an integration target, **pinned** to the primary
workspace/`develop`), `spec/architecture` (3), a detached entry and an unavailable entry (both not
selectable and, like the Engine, without `branch`); `newWorktree` available, `defaultBaseRef`
`develop`, `branchPattern` `feature/{slug}`, `integrationTargetBranch` `develop`. Like the Engine, every
workspace carries `name` (checkout folder; the primary one is `acme-app`) and `path`, and the
response carries `worktreesRoot` `{ path: '/work/acme-app-worktrees', exists: true }`; a new
simulated worktree gets `name` = slug and a `path` below that root.
`integrationSelectable` is `state === 'available' && (primary || managed)`.

Create body requires `operationId` (UUID, idempotency key; the legacy `requestId` was removed) and takes an optional `target` and an optional `slug` (same rule and meaning as the real `slug`: lowercase kebab-case ASCII, at most 80 characters; unlike the title-derived slug, which gets a `-2` suffix on a collision, a taken explicit slug answers 409 `CREATE_CONFLICT`, and a malformed one 400 `CREATE_OPERATION_INVALID`). Absent `target` = the primary checkout. Tiles (user-facing labels use "środowisko pracy" for a workspace; "workspace" is a code/contract term only):

- "Bieżący katalog" (main): no `target`; works in the current checkout, creates no branch or worktree and never switches the current branch.
- "Istniejące środowisko pracy" (existing): `{ kind: 'existing', workspaceId }`, workspace must be `selectable`.
- "Nowe środowisko pracy" (new): `{ kind: 'new-worktree', baseRef?, branch?, integrationTargetWorkspaceId? }`; omitted fields use
  defaults (`defaultBaseRef`, generated `feature/<slug>`, no integration target = follow the project).
  `baseRef` must be in `baseRefs`, `integrationTargetWorkspaceId` must be `integrationSelectable`
  (an explicit id creates an immutable pin, see below), `branch` must be a valid
  Git-style name that collides with no `baseRefs`/workspace branch. Requires `newWorktree.status` `available`.

Fields outside the tile semantics (for example `existing` + `baseRef`) fail schema validation with a 400
`Bad Request` body. Success is the real `CreatedSpec` plus demo `documentIds`: `operationId`, `specId`,
`kind: 'specification-create'`, `status: 'completed'`, `slug`, `workspaceId`, `relativeManifestPath`,
with HTTP **201** (also when a completed operation is replayed). Create increments the target workspace `specCount`; a new worktree adds a `linked` workspace and its
branch to later create-options. Create also fixes the specification location (simulated for linked workspaces).

Errors use `{ error, code }` where, as in the real Engine, `error` repeats the code. Engine codes and
statuses: 409 `BRANCH_ALREADY_EXISTS`, 422 `BASE_REF_NOT_FOUND`, 409 `CREATE_CONFLICT` (same
`operationId`, different body), 400 `CREATE_OPERATION_INVALID` (also an unusable
`integrationTargetWorkspaceId` and an invalid branch name: the field cannot be told apart), 503
`CREATE_RECOVERY_REQUIRED`, and the commit codes of a Git-enabled project: 422 `BRANCH_PROTECTED` (also for
a selected workspace or a generated or typed new-worktree branch that `commits` protects; never renamed), 409
`COMMIT_BLOCKED`, 503 `COMMIT_FAILED`. Permissions: 401 `{ error: 'authentication_required' }` and 403
`{ error: 'forbidden' }`, both **without** `code`. Demo-only extras (no Engine counterpart): 409
`DEMO_WORKSPACE_UNAVAILABLE` (the Engine overloads `CREATE_RECOVERY_REQUIRED`/`REGISTRY_CONFLICT` for an
unavailable or unknown workspace) and 400 `DEMO_INVALID_SCENARIO`. Replaying the same `operationId` and
body returns the original result.

### `integrationDestination` semantics (Engine facts)

- `workspaces[].integrationDestination = { workspaceId, branch }` is the **pinned, immutable** integration
  target of a `linked` workspace. It exists only if Create received an explicit
  `integrationTargetWorkspaceId`; the Engine stores `{ target, the branch it had attached at that moment }`.
  It is never present on the primary workspace and never points at the workspace itself. `branch` is the
  pinned branch, not the live branch of the target.
- Absent pin = "legacy/default target": Close follows the project `integrationTargetBranch`, and **only the
  primary workspace** can realise it (it must be clean and checked out on that branch). A linked workspace
  on that branch does not count. The project target is available iff
  `primary.branch === integrationTargetBranch && primary.integrationSelectable`.
- Leaving the field out is therefore not the same as explicitly choosing the primary workspace: the
  explicit choice freezes `{ primaryId, current branch }`, omission keeps following the project config.
- Create does not validate `integrationTargetBranch` (Close does, later), so a target note is advisory and
  never blocks Create. `baseRef` is independent of the target; nothing is derived from it or from a
  branch name. An `existing` target inherits the workspace's pin and cannot override it.
- Pin drift is only derivable (`workspaces[pin.workspaceId].branch !== pin.branch` or that workspace
  `integrationSelectable: false`); the UI shows a quiet note, the Engine does not declare it.

Demo divergences kept on purpose: `baseRefs[].ref` and `defaultBaseRef` are short branch names (the Engine
uses `refs/heads/...` for `baseRefs`), `branchPattern` has no `{shortId}` (the Engine allows it optionally), titles are limited to 240 (the
Engine accepts 200), and the operation-status read (proposed, includes `failed`) has no Engine
counterpart for Create.

### Demo scenario seam

Registered only with the demo endpoints (never in project mode) and **off by default**: a normal demo
Runtime silently ignores the param and header (no 400, no information leak). Enable it only for isolated
scenario environments and tests, programmatically only: `createDemoCreationState({ scenarios: true })`, or
`startRuntime({ demo: true, demoScenarios: true })`. There is no environment variable or CLI switch, and the
shipped `specflow` launcher never passes the option. The default UI never sends it. When enabled, pass `demoScenario=<name>[,<name>]` as a query
parameter or the `x-demo-scenario` header on create-options, create and operation status; unknown names
return 400 `DEMO_INVALID_SCENARIO`. Options scenarios also shape the validation of create: `git-disabled`,
`git-unavailable`, `membership-mismatch`, `no-linked`, `linked-none-selectable`, `none-available`,
`no-integration-target`, `target-dirty`, `primary-dirty`, `platform-dirty`, `primary-other-branch`
(a linked workspace holds the target branch, the primary does not), `pin-drift` (a pin whose target moved
to another branch), `primary-detached`,
`head-base`, `head-base-no-branch`, `many-workspaces`, `managed-false`, `long-names`, and the commit
scenarios `protected-primary` (the primary checkout is on the protected `main`), `protected-all-linked`
(every linked workspace is on a protected branch) and `new-branch-protected` (the generated `release/<slug>`
branch is protected, `newWorktree.branchProtected`). The default seed has Git on: `commits: { protectedBranches: ['main'] }`;
`git-disabled` removes `commits` and every commit-related field, reason and progress step. The scenario
`git-policy-invalid` mirrors an invalid Git configuration section: every workspace is unavailable with the
reason `git-policy-invalid`, `newWorktree` is `{status:'unavailable', reason:'git-policy-invalid'}`, there are no
base refs and no `commits`, and a Create fails closed with 503 `GIT_POLICY_INVALID`. The scenario
`operations-panel` seeds `GET /api/demo/specifications/operations` with every operation status
(`reference.api.specs-operations-list`). Read failures:
`options-forbidden` (403), `options-error` (503). Create outcomes: `branch-taken`, `stale-workspace`,
`integration-target-unavailable`, `base-ref-unavailable`, `forbidden`, `network-uncertain` (commits,
then drops the connection; replay with the same `operationId` returns the result), `recovery-required`
(holds the operation; a replay stays 503 until the status read or create carries `recovery-resolved`),
`branch-protected` (422), `commit-blocked` (409) and `commit-failed` (503, the operation then stays
recovery-required like `recovery-required`).

Client transport rule for `POST /api/demo/specifications` (UI, not Runtime): the request has an explicit
15 s timeout. A request that was never dispatched (the browser reports no connection) is a definite
"nothing was created": the form stays editable and the same body and `operationId` may simply be sent
again. Any failure after dispatch without a coded answer (timeout, reset, abort, an answer without a
body) may have been committed, so it is an uncertain outcome: the form locks, and the only action is
to replay the stored request verbatim (same `operationId` and body, never rebuilt from the current
form, catalogue revision or options) or to read the operation status.
