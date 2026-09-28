---
id: architecture.runtime.ownership-and-lifecycle
type: architecture
title: Runtime ownership and lifecycle
status: current
read_when:
  - adding a long-lived Runtime capability or resource
  - introducing HTTP, realtime, MCP, provider-process, or persistence infrastructure
  - changing startup, shutdown, cancellation, or restart recovery
  - deciding whether a concern belongs to Runtime or a transport adapter
summary: >
  Nevo SpecFlow Runtime is the composition and lifecycle owner for long-lived local
  application resources. Transports are adapters, resources have one lifecycle owner,
  startup/shutdown are deterministic, and restart recovery reconciles durable state
  before accepting conflicting work.
related:
  - architecture.principles.enforceable-invariants
  - architecture.ai.canonical-session-turn-work
  - architecture.ai.provider-boundary
  - engineering.shared.async-and-lifecycle
  - engineering.shared.effects-and-io
  - architecture.principles.normative-language
---

# Runtime ownership and lifecycle

The **Nevo SpecFlow Runtime** is the long-lived local backend of the product. It is not
synonymous with an HTTP server.

A Runtime instance composes application capabilities and owns the lifetime of resources
that must survive longer than one CLI operation.

## Responsibility boundary

Runtime may own resources such as:

- provider processes and provider/session registries;
- local persistence and execution records;
- filesystem/worktree watchers;
- HTTP or realtime servers;
- local MCP endpoints;
- background coordinators, timers, and queues;
- cancellation and shutdown coordination.

HTTP, realtime transports, MCP, CLI, and UI are **external boundaries/adapters**. They expose
or consume application operations; they do not become the source of truth for lifecycle or
workflow state.

## Composition root

There is one Runtime composition path for production behavior.

Entrypoints may differ — CLI start, development bootstrap, tests — but production
construction must not create subtly different dependency graphs or lifecycle semantics.

The composition root:

1. creates infrastructure dependencies;
2. constructs application capabilities/coordinators;
3. starts externally reachable adapters only when their dependencies are ready;
4. owns shutdown in reverse dependency order.

## One lifecycle owner

Every process, server, timer, listener, stream, connection, registry entry, or other
long-lived resource has one explicit owner responsible for:

- creation;
- active lifetime;
- cancellation;
- terminal transition;
- cleanup after success, failure, partial startup, or shutdown.

Two subsystems must not independently believe they own the same resource.

## Startup

Startup is deterministic and fail-closed.

A resource that other capabilities depend on becomes reachable only after its startup has
succeeded. Partial startup must either be completed or unwound; the Runtime must not advertise
readiness while required dependencies are unavailable.

## Shutdown

Shutdown is an application lifecycle operation, not a collection of unrelated process signal
callbacks.

The Runtime MUST:

- stop accepting conflicting new work;
- signal cancellation to owned long-running operations;
- allow bounded graceful completion where the operation contract permits it;
- persist or terminalize state that cannot safely remain active;
- release listeners, servers, processes, streams, and timers;
- produce diagnostics for resources that fail to stop cleanly.

## Restart recovery

Persistent state MAY describe work whose live process disappeared during a crash or restart. On
boot, Runtime MUST reconcile durable state with what can actually be resumed before admitting
conflicting new work.

Recovery never fabricates a live resource merely because a persisted record says "active".

Each operation/session interaction MUST be classified by its real recovery semantics:

- resumable from durable/provider identity;
- reconstructable from durable state;
- interrupted because the original live operation no longer exists.

Recovery MUST settle contradictions before new work that would conflict with them is admitted.

## Runtime state versus repository state

Execution state that exists only to coordinate local processes/recovery belongs in local Runtime
storage, not in Git-tracked product/specification documents.

Repository state records durable product facts. Runtime storage records execution facts needed to
continue or reconcile local work.

## Trust boundary

Binding a local Runtime beyond loopback changes the trust boundary.

Authorization assumptions MUST be explicit and replaceable at the adapter boundary. "Reachable on
the network" MUST NOT silently mean "authenticated".
