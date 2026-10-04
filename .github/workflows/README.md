# Workflows

| Workflow                                             | Trigger                                 | Purpose                                                                                                     |
| ---------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](ci.yml)                                   | PRs; pushes to `main`, `release/v*`     | Quality/typecheck/test/build, dependency review on PRs, and installed-product smoke on Linux/Windows/macOS. |
| [`chromatic.yml`](chromatic.yml)                     | PRs; pushes to `main`                   | Publish the shared Storybook and run visual regression tests when its project token is available.           |
| [`codeql.yml`](codeql.yml)                           | PRs; protected-branch pushes; weekly    | CodeQL analysis for JavaScript/TypeScript.                                                                  |
| [`pr-title.yml`](pr-title.yml)                       | PR opened / edited / synced             | Conventional Commits check on the PR title.                                                                 |
| [`dependabot-pr-title.yml`](dependabot-pr-title.yml) | `workflow_run` after failed PR-title CI | Safely normalize Dependabot's generated title and re-run the title check.                                   |
| [`release.yml`](release.yml)                         | `workflow_dispatch` on `release/v*`     | Resolve candidate, build it once, smoke the same tarball on 3 OSes, then tag/attest/upload and advance.     |
| [`cut-release-line.yml`](cut-release-line.yml)       | `workflow_dispatch`                     | Cut a release line and open/hand off the main-bump PR.                                                      |
| [`promote-release.yml`](promote-release.yml)         | `workflow_dispatch` on `release/v*`     | Open the channel-promotion PR.                                                                              |

Workflows use least-privilege permissions. No privileged workflow checks out and executes
untrusted pull-request code. Release planning only reads checks/PR state; write and OIDC/attestation
permissions exist only in the final `publish release` job after the exact candidate has passed the
cross-platform smoke matrix.

The release workflows may use the optional repository-scoped `CI_GITHUB_RELEASE_TOKEN` described
in [releasing](../../docs/engineering/repository/releasing.md#ci_github_release_token).

## Chromatic

The workflow runs the version-pinned `chromatic` CLI from `tools/storybook/`, where the
repository's shared Storybook is owned. Configure the repository Actions secret
`CHROMATIC_PROJECT_TOKEN` from the Chromatic project's **Manage → Configure** page. The token is
never stored in source. Runs without the secret, including pull requests from forks, report a
successful skipped job instead of exposing credentials or waiting forever.

`chromatic` is informational until the team intentionally adds it to the branch ruleset after
establishing and reviewing the first baseline.

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
