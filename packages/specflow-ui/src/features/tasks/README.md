# Tasks UI feature

**Owner:** Tasks. The Specification Overview is a consumer, not the owner.

- `pages/` — Full Task screen with independent Task-detail identity and loading.
- `list/` — the Tasks page (`/specs/:specId/tasks`): the Runtime's configured grouping rendered as
  delivered, the validated `?blocking=specification` and `?group=` search, New task. No selection
  and no bulk actions.
- `overview/` — the Overview flows Requires attention opens (first-start confirmation, Cancel, a
  direct start, the Specification's Return), the progress text, and the control-center stories.
- `execution/` — the Now block, its dialogs and the Specification's Now on the Overview.
- `contributions/specification-overview/` — the Overview's Tasks summary and the mapping of
  attention actions to those flows (composition: it may import the Specs extension points).
- `inspectors/` — short Task Preview presentation used by the Specification Secondary host.
- `api.ts`, `queries.ts`, `useSpecificationTask.ts`, `read-model/` — Task-owned models and
  remote-data access.

The UI computes no grouping, attention or legality: groups, attention items and their actions,
progress and the Overview summary come from the Runtime. Both production and integration surfaces
use typed Runtime APIs; do not add fixture fallbacks. Per-project or per-user grouping is a Runtime
setting of the same shape; the UI needs no change for it.

The `tasksUiModule` registers the `specification.work.sections` Tasks summary (slot `main`) and the
Tasks `specification.attention.items`.
