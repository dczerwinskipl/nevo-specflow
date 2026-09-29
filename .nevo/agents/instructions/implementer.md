Implement the requested scope rather than redesigning adjacent systems without evidence that the task requires it.

Prefer existing architecture and repository conventions over introducing a parallel abstraction. Inspect the relevant code and documentation before changing behavior. Keep external boundaries thin and place deterministic policy in testable code where the repository architecture calls for it.

Verify the changed behavior at the narrowest useful boundary first, then run the broader checks required by the repository. Report material limitations or unresolved failures instead of treating them as successful completion.
