---
id: docs.architecture-workflow-readme
type: hub
title: Workflow architecture
status: current
summary: >
  Entry point for deterministic Nevo SpecFlow workflow state, transitions, gates,
  attempts, and resumable mutation architecture.
---

# Workflow architecture

- [Deterministic workflow](deterministic-workflow.md)
- [Workflow kernel](workflow-kernel.md)
  - [Definitions, executors and gates](workflow-definitions-and-gates.md)
  - [Runs, handoffs, returns and wait](workflow-runs-and-handoffs.md)
  - [Task resources and preparation](workflow-tasks.md)
  - [Continuation and attention](workflow-continuation-and-attention.md)
  - [Storage and recovery](workflow-storage-and-recovery.md)

## Responsibility map

The pure `@nevo/workflow` kernel is **not** the layer that reads YAML files, evaluates
SpecFlow gates or writes Git. The Engine's adapter interprets the host-specific annotations
and owns changes to Specification and Task resources.

```mermaid
block-beta
  columns 1
  block:entry
    columns 2
    entryTitle["1. Workflow entry points"]:2
    entrySpec["Specification operations"]
    entryTask["Task operations"]
  end
  block:adapter
    columns 2
    adapterTitle["2. Engine workflow adapter"]:2
    adapterDefinitions["Definitions, gates and attention"]
    adapterEffects["Task effects and continuation"]
  end
  block:kernel
    columns 2
    kernelTitle["3. Workflow Kernel"]:2
    kernelDefinitions["Compiled definitions and Runs"]
    kernelDecisions["Coordinator, transitions and replay"]
  end
  block:state
    columns 2
    stateTitle["4. Execution state"]:2
    stateRuns["Bound workspace Run records"]
    stateJournal["Local change journal"]
  end
```

The bands explain **ownership**, not an execution order: the adapter invokes
`decide(definition, run, command)` and applies its result. Neither Runtime nor the
UI owns an alternative workflow state machine. A Specification and each Task use the same neutral
core with different subject identities. The kernel owns only pure decisions; Engine owns recovery
and persistence. See [Workflow kernel](workflow-kernel.md),
[Deterministic workflow](deterministic-workflow.md) and
[ADR 0023](../decisions/0023-neutral-workflow-coordinator-and-manual-execution.md).
