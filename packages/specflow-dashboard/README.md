# `@nevo/specflow-dashboard`

The Nevo SpecFlow **dashboard vertical**. Two entrypoints, one boundary between them:

| Import                           | Owns                                                                                                                                                                                                 | Commander?                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `@nevo/specflow-dashboard` (`.`) | the **capability**: `runDashboard(): DashboardResult`, `DASHBOARD_BOOTSTRAP_MARKER`. Framework-independent — no Commander, no argv, no stdout, no exit codes, no HTTP server.                        | no                        |
| `@nevo/specflow-dashboard/cli`   | the **command adapter**: `createDashboardCommand(ctx): Command` — the `dashboard` command name, its (future) `--port` / `--host` / `--open` options and subcommands, and the CLI→capability mapping. | yes (its only dependency) |

The `nevo-spec` shell ([`@nevo/specflow`](../specflow/README.md)) **composes** the command
— `program.addCommand(createDashboardCommand(ctx))` — it does not define it. Same shape
as a feature owning its HTTP routes while the server root only mounts them: Commander,
like a web framework, lives in the adapter and never reaches the capability/runtime.

- **Bootstrap only.** `runDashboard()` returns a deterministic marker
  (`Nevo SpecFlow dashboard command is available.`). The real dashboard runtime / React /
  Vite / assets are **not** migrated yet. A later change swaps the capability body
  without touching its signature, the `./cli` adapter, or the shell boundary.
- **Distribution.** `private: true` — never published or installed on its own.
  `@nevo/specflow`'s packaging step bundles the built `dist/` into the product tarball
  (see [`docs/development/product-packaging.md`](../../docs/engineering/repository/product-packaging.md)),
  so a consumer installs exactly one artifact. The source dependency stays a real
  `workspace:*` edge; only the distribution is single-artifact.

```
src/index.ts        runDashboard(): DashboardResult          (pure)
src/cli/command.ts  createDashboardCommand(ctx): Command      (Commander adapter)
```
