### 1. Confirm planning input

Read the current specification, linked product/UX decisions, architecture and reference contracts, and applicable repository rules. Determine which changes are in scope and whether implementation prerequisites were assessed.

If a portion hides a material UX decision, unknown infrastructure contract, or independently owned
capability requiring design, identify its owner and unblocking result. Return specification or
architecture gaps to Spec Writer and genuinely new product behavior to its UX owner, without
reopening settled decisions. Plan other independently decided portions now rather than bouncing
the entire specification between profiles or inventing missing semantics.

### 2. Map ownership before slicing

Map outcomes to the smallest meaningful owning capabilities. Distinguish shared infrastructure, backend/domain or API contracts, product UI compositions, data integration, and feature-wide verification.

Use the shared architecture-discovery procedure only for boundaries that are unclear. An isolated technical layer does not automatically earn a new task; conversely a single user-facing screen does not justify bundling unrelated infrastructure work into its implementation.

### 3. Determine task versus separate specification

A separate specification is appropriate when a prerequisite has an independently valuable goal, reusable contract, distinct architecture decision, and can be accepted apart from the dependent product feature. Recommend the split upstream rather than materializing a new spec silently.

Within one specification, create task boundaries around cohesive, independently reviewable deliverables and their true dependencies. Prefer dependency-complete vertical slices. Separate shared prerequisite work when it otherwise causes consumer tasks to create parallel infrastructure locally.

### 4. Classify work and propose agent routing

For every task, identify the principal implementation work kind: `ui`, `backend`, `integration`, or `general`. This is a planning classification, not a provider/model choice and not the change's architectural weight.

- `ui`: product UI or reusable UI mechanics; usually `nevo-agents:implementer-ui`.
- `backend`: domain, Runtime, API, persistence or backend integration; usually `nevo-agents:implementer`.
- `integration`: cohesive wiring across already decided boundaries; select the profile that owns most of the work, or split if distinct responsibilities are independently verifiable.
- `general`: documentation, tooling, migrations or other work outside those domains; choose by the actual capability.

Do not label a broad feature `fullstack` to avoid resolving its separable ownership. When one inseparable task crosses UI/backend, record why a single task is justified and which implementation knowledge it needs.

Keep three concerns separate: specification scope/classification, task work kind, and step-specific executor profile. Implementation and independent review can select different profiles for the same task; do not equate an implementation hint with a workflow definition. Treat work-kind and profile routing fields as proposals for the future task schema until the deterministic Runtime owns their validation and resolution; do not invent unsupported manifest keys in today's repo.

### 5. Define each task handoff

Use the repository's actual task schema and conventions when present. Provide:

- a concise goal and independently observable deliverable;
- owning capability and consumed/produced contracts;
- in-spec task dependencies and references to external prerequisite specifications/contracts where
  relevant; a cross-spec reference is not already an enforceable task `depends_on` edge;
- minimal required context references and optional material;
- scope boundaries appropriate to that repository, including path constraints if supported;
- acceptance scenarios and verification at the correct boundary;
- principal work kind and recommended implementation profile as planning metadata or in the report until supported by the task model.

Do not repeat entire specs, copy contract schemas, or require every task to read unrelated areas. Make a task large enough to produce a meaningful reviewable result; fold trivial setup into the task that uses it.

### 6. Validate the complete plan

Independently inspect:

- every in-scope requirement has an owning task or an explicit external prerequisite;
- every task has an identified requirement, coherent owner and testable result;
- the dependency graph is acyclic and allows safe parallel work;
- prerequisites are not merely hidden in consumer tasks;
- two tasks do not independently own or modify the same authoritative behavior without a sequencing rule;
- cross-task integration and user-visible end-to-end behavior have verification ownership;
- any blocked portion is explicit and unrelated ready tasks can proceed.

Use a fresh-reader check when risk is high: could an Implementer and Reviewer, given only the task and its linked context, identify the right boundary and prove completion? Return substantive gaps to preparation. Do not convert these checks into a mandatory new ceremony for a trivial change.

### 7. Report readiness and handoff

Produce the proposed task graph, each task's work kind/profile recommendation, independent spec split suggestions, unresolved blockers, and verification coverage. Use the shared terms: ready for decomposition (decided scope), planned, dependent (a task awaiting
an identified prerequisite), and ready for execution (a planning assessment, not actual admission).
Do not manufacture executable tasks for unresolved product behavior, and do not block independent
ready tasks just because another region still needs a contract. Actual workflow step readiness, attempts, gates and state transitions belong to SpecFlow's deterministic engine, not to this planning assessment.

When implementation later uncovers a material missing dependency, it should report evidence and impact back to specification/task planning. Do not silently expand the task's approved ownership; independent work may continue.
