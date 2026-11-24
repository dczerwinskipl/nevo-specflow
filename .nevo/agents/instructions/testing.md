Before choosing a verification strategy, query the documentation for the implementation area together with `testing`, for example `pnpm docs:find react testing` or `pnpm docs:find cli testing`.

Prefer tests that prove the changed policy or behavior at the narrowest stable boundary, then run the broader repository checks required for integration. Do not replace missing targeted coverage with a green broad suite when the defect can be tested directly.

Follow the ownership-based placement rules in `engineering.shared.testing`: focused module/component tests and stories stay beside their owner; package-level `test/` is for genuine cross-boundary verification. Do not infer placement from neighboring legacy files when they conflict with the current documentation.

Verification is Linux-first. Spawning Git (and other) processes on Windows and macOS is very slow: a real-Git test file (Engine, Runtime HTTP, CLI, or any test that spawns many Git processes or creates many repositories) takes seconds on Linux and tens of minutes on Windows, and running several at once can exhaust the machine. On a Windows or macOS host:

- On the host, run only fast unit tests and the single new or changed test case you are iterating on (`vitest run <file> -t "<name>"`), plus typecheck and lint.
- Never run whole real-Git files, whole package suites, repeated or shuffled runs, or "the full file to be sure" on the host. Run them on Linux with `tools/dev/linux-test.sh` when Docker is available (see `engineering.repository.local-setup`, section "Running slow tests on Linux"); it clones the committed branch into a Node container, so commit first. Without Docker, leave them to CI and say so in the report.
- Windows and macOS coverage comes from the CI shards. Re-run on the host only the tests that failed there, by name, to reproduce and fix them.
- A failure that appears only on the host (for example a symlink privilege error or a short/long path name) is an environment limit until it is confirmed on Linux or in CI; do not change code or tests for it first.

Report which tests ran where (host, Linux container, or left to CI). A reviewer applies the same rule to its own probes.
