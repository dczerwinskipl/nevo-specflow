# `@nevo/specflow-runtime`

The **Nevo SpecFlow Runtime** vertical. It owns the long-lived application backend
boundary; today it is only a bootstrap proof.

| Import                         | Owns                                                                                    | Commander? |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------- |
| `@nevo/specflow-runtime` (`.`) | Framework-independent Runtime capability: `startRuntime()`, `RUNTIME_BOOTSTRAP_MARKER`. | no         |
| `@nevo/specflow-runtime/cli`   | Root-level `start` command adapter: `createStartCommand(ctx)`.                          | yes        |

The `nevo-specflow` shell ([`@nevo/specflow`](../specflow/README.md)) composes the
command. The shell does not implement Runtime behavior.

The real Runtime will eventually own long-lived resources such as transports, provider
processes, persistence, recovery, and UI hosting. A concrete HTTP server is an adapter
inside the Runtime, not the name of the whole backend.

This package is private and bundled into the single `@nevo/specflow` distributable.
