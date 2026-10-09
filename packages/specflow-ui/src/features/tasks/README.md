# Tasks UI feature

**Owner:** Tasks. Specification Work is a consumer, not the owner.

- `pages/` — Full Task screen with independent Task-detail identity and loading.
- `inspectors/` — short Task Preview presentation used by the Specification Secondary host.
- `contributions/specification-work/` — Task group, row, selection, and execution UI for Work.
- `model.ts` and `useSpecificationTask.ts` — current Task detail model/query. The Task presentation model and domain status display belong here. The Work contribution receives explicit callbacks from its host rather than accessing the Workspace runtime context.

The Specification host owns the layout, Secondary navigation, routing composition and aggregate
Workspace projection. The feature owns its own content and domain-specific behavior. Both
production and integration surfaces use typed Runtime APIs; do not add fixture fallbacks.

Future feature settings (e.g., lane/status rules) are **not implemented**. When introduced,
backend validation/configuration belongs to the feature's Runtime ownership, and UI contributes
to a Project Settings extension point rather than becoming a hardcoded part of Work.
