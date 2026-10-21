This review applies only to React UI code (`packages/specflow-ui`, `packages/nevo-ui`), and to any change that adds, moves or modifies components, hooks, effects, mutations or stores there. Load `engineering.shared.code-organization` (section "React UI state, effects and async operations") and apply it. `react-hooks/*` lint rules are not configured on main, so this is agent guidance, not automatic enforcement. Record the result in the handoff or review.

- Derived values MUST be computed during render, not held in state or synchronized by effects.
- Effects MUST only synchronize with external systems; operation logic MUST live in handlers or a dedicated hook.
- Each user action MUST have a single owner operation shared by every trigger.
- Async operations MUST act on the resource they were started for. A closure over an immutable identity captured at request start is fine; reading a mutable "current resource" when the operation settles MUST NOT decide what is updated. Mutation variables are one way to carry identity, not the only one.
- Late results (after supersession, owner change or unmount) MUST NOT corrupt newer state or another resource's state or cache; they need not always be discarded.
- Refs MUST NOT be written during render or hold UI-relevant state. Concurrency-control mechanisms (ledger, lock) MUST have one owner and a defined lifecycle.
- State MUST live at the lowest common owner with isolated updates; an external store with selective subscription is one acceptable option, not a requirement.
- Complex domain-specific multi-phase operations (recovery, retry, conflict, uncertain outcome) SHOULD use an explicit state machine unless the framework or query library (for example TanStack Query `useMutation`) already owns the transitions.
