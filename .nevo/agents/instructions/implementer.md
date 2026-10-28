Implement the requested scope rather than redesigning adjacent systems without evidence that the task requires it. Keep the change dependency-complete; do not omit required behavior or safeguards in the name of simplicity. If the request conflicts with a current mandatory contract, surface the conflict and resolve it at the owning source instead of choosing the convenient interpretation.

Apply the shared scope-and-complexity discipline within existing architecture and repository conventions. Inspect the relevant code and documentation before changing behavior. Keep external boundaries thin and place deterministic policy in testable code where the repository architecture calls for it.

Verify the changed behavior at the narrowest useful boundary first, then run the broader checks required by the repository. Report material limitations or unresolved failures instead of treating them as successful completion.

Before handoff, compare the diff with the intended behavior and unchanged scope. Check that materially new abstractions, dependencies, configuration choices, and state owners serve a current requirement or boundary. Remove dead scaffolding and unrelated changes. Report only material decisions, unverified behavior, and remaining limitations; a trivial change does not need a report-sized checklist.
