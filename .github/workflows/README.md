# Workflows

| Workflow                                             | Trigger                                  | Purpose                                                                                            | `permissions`                                               |
| ---------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`ci.yml`](ci.yml)                                   | PRs; pushes to `main`, `release/v*`      | `pnpm check:quality`, then affected typecheck / test / build.                                      | `contents: read`                                            |
| [`chromatic.yml`](chromatic.yml)                     | PRs; pushes to `main`                    | Publish the shared Storybook and run visual regression tests when its project token is available.  | `contents: read`                                            |
| [`codeql.yml`](codeql.yml)                           | PRs; protected-branch pushes; weekly     | Analyze JavaScript and TypeScript for security vulnerabilities.                                    | `contents: read`, `actions: read`, `security-events: write` |
| [`pr-title.yml`](pr-title.yml)                       | PR opened / edited / synced              | Conventional Commits check on the PR title (`<type>(<scope>): …`, scope required).                 | `pull-requests: read`                                       |
| [`dependabot-pr-title.yml`](dependabot-pr-title.yml) | `workflow_run` after a failed `PR title` | Lower-case the subject of a Dependabot Conventional Commit title, then re-run that `PR title` run. | `pull-requests: write`, `actions: write`                    |
| [`release.yml`](release.yml)                         | `workflow_dispatch` on `release/v*`      | Verify HEAD CI, then tag + GitHub Release (`beta`/`rc`/`stable`); post-stable advance PR.          | `contents: write`, `pull-requests: write`, `checks: read`   |
| [`cut-release-line.yml`](cut-release-line.yml)       | `workflow_dispatch`                      | Branch `release/vX.Y` off current `main`; open or hand off the main-bump PR.                       | `contents: write`, `pull-requests: write`                   |
| [`promote-release.yml`](promote-release.yml)         | `workflow_dispatch` on `release/v*`      | Open the PR moving `release/vX.Y`'s channel forward (`beta→rc` / `rc→stable`).                     | `contents: write`, `pull-requests: write`                   |

Each workflow declares the **minimum** `permissions` for the GitHub APIs it actually
calls — `release.yml` adds `checks: read` because the release tool reads the
release-branch HEAD check-runs; the others neither read checks nor tag, so they don't.
`dependabot-pr-title.yml` adds `actions: write` because it re-runs the failed `PR title`
run after editing the title. It uses `workflow_run` — not `pull_request_target` — because
GitHub hands a Dependabot-triggered `pull_request` / `pull_request_target` workflow a
**read-only** token regardless of its `permissions:` block, whereas the `workflow_run`
follow-up runs in the base-repo context with the write token it declares. It never checks
out, downloads artifacts, or executes anything from the PR.

The three `workflow_dispatch` workflows take an optional `CI_GITHUB_RELEASE_TOKEN`
secret (a fine-grained, repository-scoped PAT) so a PR they open triggers `pull_request`
CI and can auto-merge; without it they push the branch and print the exact
`gh pr create …` command. See
[`docs/engineering/repository/releasing.md`](../../docs/engineering/repository/releasing.md#ci_github_release_token).

Full behavior: [`docs/engineering/repository/ci.md`](../../docs/engineering/repository/ci.md) and
[`docs/engineering/repository/releasing.md`](../../docs/engineering/repository/releasing.md).

## Chromatic

The workflow runs the version-pinned `chromatic` CLI from `tools/storybook/`, where the
repository's shared Storybook is owned. Configure the repository Actions secret
`CHROMATIC_PROJECT_TOKEN` from the Chromatic project's **Manage → Configure** page. The
token is never stored in source. Runs without the secret (including pull requests from
forks) report a successful skipped job instead of exposing credentials or waiting forever.

`chromatic` is informational until the team intentionally adds the `chromatic` job to the
branch ruleset after establishing and reviewing the first baseline.

## Action pinning

Every `uses:` is pinned to a **full commit SHA**, with the human-readable version as a
trailing comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is mutable — its owner can move it — so a SHA is the only immutable reference.
Dependabot's `github-actions` updater bumps both the SHA and the comment together, so
this costs nothing to maintain.

Current pins:

| Action                                | SHA                                        | Version |
| ------------------------------------- | ------------------------------------------ | ------- |
| `actions/checkout`                    | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1  |
| `actions/setup-node`                  | `820762786026740c76f36085b0efc47a31fe5020` | v7.0.0  |
| `actions/cache`                       | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | v6.1.0  |
| `amannn/action-semantic-pull-request` | `48f256284bd46cdaab1048c3721360e808335d50` | v6.1.1  |
| `github/codeql-action`                | `88585263c0627ee42c0e1c5143a112c8d6f4aa18` | v4.38.2 |

## CodeQL

CodeQL analyzes `javascript-typescript` in build mode `none` on pull requests, protected
branch pushes, and a weekly schedule. The `CodeQL` job is a required protected-branch
check. The action is pinned to an immutable commit like every other third-party action.
