# Workflows

| Workflow                                             | Trigger                                   | Purpose                                                               |
| ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| [`ci.yml`](ci.yml)                                   | PRs, main/release, nightly, manual        | Fast PR tests; full suites and product smoke on main/nightly          |
| [`engine-filesystem.yml`](engine-filesystem.yml)     | main Engine changes, nightly, manual      | Full Git/process/recovery and adapters on three OSes                  |
| [`chromatic.yml`](chromatic.yml)                     | Manual; pushes to `main`                  | Publish Storybook and run visual regression when a token is available |
| [`codeql.yml`](codeql.yml)                           | Manual; PRs; protected branches; weekly   | CodeQL analysis for JavaScript/TypeScript                             |
| [`pr-title.yml`](pr-title.yml)                       | PR opened / edited / synced               | Conventional Commits check on PR titles                               |
| [`dependabot-pr-title.yml`](dependabot-pr-title.yml) | `workflow_run` after a failed PR-title CI | Normalize Dependabot titles and re-run checks                         |
| [`release.yml`](release.yml)                         | Manual on `release/v*`                    | Build, smoke, tag, attest and upload a release                        |
| [`cut-release-line.yml`](cut-release-line.yml)       | Manual                                    | Cut a release line and hand off the version-bump PR                   |
| [`promote-release.yml`](promote-release.yml)         | Manual on `release/v*`                    | Open the channel-promotion PR                                         |

Draft pull requests intentionally skip the expensive required checks in CI and CodeQL. The workflows still run and publish skipped required jobs, so repository rules remain satisfied for the draft state without consuming the full test/build matrix. Marking a pull request **Ready for review** triggers the fast required PR pipeline on the same HEAD; converting it back to draft cancels any superseded PR run through the existing concurrency policy. CI and CodeQL also support manual `workflow_dispatch`, so a draft branch can be fully validated on demand without changing PR state. The PR-title check continues to run for drafts because it is cheap and gives immediate metadata feedback.

Workflows use least-privilege permissions. No privileged workflow checks out and executes
untrusted pull-request code. Release planning only reads checks/PR state; write and OIDC/attestation
permissions exist only in the final `publish release` job after the exact candidate has passed the
cross-platform smoke matrix.

The release workflows may use the optional repository-scoped `CI_GITHUB_RELEASE_TOKEN` described
in [releasing](../../docs/engineering/repository/releasing.md#ci_github_release_token).

## Test tiers

**Pull requests (fast feedback):** Quality, lint, TypeScript, build, and affected
unit-level package tests. `@nevo/specflow-engine` retains its fast `test:unit`.
Additionally, the stable `engine transport smoke` job inspects the PR diff
and runs real-Git Engine Close lifecycle tests plus authorized HTTP Create/Close
and offline/cross-process CLI integration on Ubuntu when Engine, CLI, Runtime,
contracts, or CI test selection change. It succeeds without running heavy tests
only for unrelated PRs, logging its path decision. This smoke check must be
required in branch protection once reviewed. Full cross-platform SIGKILL/crash
remains a separate explicit premerge/promote or postmerge check, not silently
replaced by the fast PR `verify tests` check.

**After merge to `main` (or release branch):** `ci.yml` executes all package
`test` scripts, including the full Engine suite, CLI, Runtime and Storybook,
plus product packaging/smoke on Linux, macOS and Windows. Changes affecting the
Engine, CLI, Runtime or contracts also trigger full three-OS filesystem and adapter integration.

**Nightly (UTC):** `ci.yml` at 02:17 runs the complete package suite and
installed-product smoke; `engine-filesystem.yml` at 03:17 runs the full
Linux/macOS real-Git, concurrent-process and crash/recovery tests with full
CLI/Runtime adapter tests, plus Windows native-Git six-shard Engine and separate
CLI/Runtime jobs. Manual `workflow_dispatch` supports optional exact
`commit_sha` pinned checkout, including before merge; a run must report
the actual Git SHA, Node, Git and OS. Do not substitute prior-HEAD proof.

Locally, `pnpm --filter @nevo/specflow-engine test` still runs the **complete**
suite, while `test:unit` is the minimal fast gate. `test:filesystem:full`
remains a separate sequential, single-worker OS regression.

**Branch protection:** The current `main` and release rulesets still list
`product smoke` as a required check. The job is explicitly **skipped** on PRs;
a skipped check is not evidence of packaging validation. Remove that requirement
when updating branch rules for the fast tier. The affected PR `engine transport smoke`
check should be added to required checks after CI review. Keep the existing fast
`quality`, `verify tests`, `build`, `codeql`, `pr-title` and dependency review
requirements. Heavy platform checks remain deliberate for sensitive premerge changes.

## Chromatic

The workflow runs the version-pinned `chromatic` CLI from `tools/storybook/`, where the
repository's shared Storybook is owned. Configure the repository Actions secret
`CHROMATIC_PROJECT_TOKEN` from the Chromatic project's **Manage → Configure** page. The token is
never stored in source. Pull requests do not run Chromatic automatically. Use **Actions → Chromatic → Run workflow** and
select the PR branch when visual review is needed. Pushes to `main` continue to publish
automatically so the baseline is kept current. Runs without the secret report a successful skipped
job instead of exposing credentials or waiting forever.

`chromatic` is informational and is not a required branch check.

## Action pinning

Every third-party `uses:` reference is pinned to a full commit SHA. Dependabot's
`github-actions` updater keeps the SHA and version comment current.

Current pins:

| Action                                | SHA                                        | Version |
| ------------------------------------- | ------------------------------------------ | ------- |
| `actions/checkout`                    | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1  |
| `actions/setup-node`                  | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0  |
| `actions/cache`                       | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | v6.1.0  |
| `amannn/action-semantic-pull-request` | `48f256284bd46cdaab1048c3721360e808335d50` | v6.1.1  |
| `actions/dependency-review-action`    | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | v5.0.0  |
| `github/codeql-action`                | `2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2` | v4.38.2 |
| `actions/attest`                      | `1e69f48acb82d1966a394da916b4c1698aa569d6` | v4.2.2  |
| `actions/upload-artifact`             | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | v7.0.1  |
| `actions/download-artifact`           | `37930b1c2abaa49bbe596cd826c3c89aef350131` | v7.0.0  |

## Security gates

Dependency Review rejects pull requests that introduce a dependency with a vulnerability of
moderate severity or higher. CodeQL scans JavaScript/TypeScript on pull requests, protected-branch
pushes, and weekly. Pull-request analyses, including fork and Dependabot pull requests, use GitHub's
supported pull-request SARIF upload path; the workflow does not use `pull_request_target`.
`main` requires both the stable `codeql` check and native CodeQL code-scanning results, blocking
updates for generic code-scanning errors or high-or-higher security alerts. Release lines keep the
stable `codeql` check without the native code-scanning rule so `cut-release-line` can create a new
branch before branch-specific analysis exists.

## Full cross-platform evidence after E1/E2

The temporary T17 push-triggered platform gate and formatting diagnostics have
been retired. Routine PRs use fast `ci.yml` checks (including selective Engine
transport smoke) plus CodeQL and PR-title validation. The full cross-platform
Engine filesystem, SIGKILL, recovery, CLI and Runtime adapter matrix is owned
by `engine-filesystem.yml`: scheduled nightly, triggered by relevant pushes to
`main`, or explicitly invoked via `workflow_dispatch` with `commit_sha` for
an **exact premerge candidate**. A manually requested verification does not
implicitly waive any branch-protection checks.

Deleting or changing a workflow does not retroactively cancel already queued or
running GitHub Actions jobs. Stale runs from the retired T17 gate must be
cancelled via the GitHub Actions UI when necessary.

**Required PR smoke routing:** `engine transport smoke` covers affected
Engine/CLI/Runtime/contract/lockfile/toolchain changes; UI-only changes skip its
expensive steps. The existing `verify tests` required aggregate depends on
and checks the smoke result for every ready PR, so a skipped or failed relevant
smoke job cannot pass the required aggregate. Configure the smoke check as
an independent branch-protection requirement when repository rules are next
edited. The T17 temporary three-OS gate remains in place until independent
coverage acceptance.
