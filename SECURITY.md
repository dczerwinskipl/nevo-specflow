# Security policy

Nevo SpecFlow is maintained by a single person on a best-effort basis.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab → **Report a vulnerability**.
2. Describe the issue, affected files/versions, impact, and reproduction steps.

This opens a private advisory visible only to you and the maintainer. If you cannot use
that form, contact the maintainer via their GitHub profile.

## What to expect

This is a spare-time open-source project, so there is **no guaranteed response time**.
Reports are looked at as soon as is practical. In general:

- an acknowledgement once the report has been read;
- an assessment of severity and affected surface, or a request for more detail;
- for a confirmed issue in a maintained release line, a fix via the
  [hotfix flow](docs/engineering/repository/releasing.md#hotfix-on-a-released-line);
- credit in the advisory and release notes unless you prefer otherwise.

## Scope

In scope:

- product packages under `packages/`, including the public CLI and Runtime;
- authentication, authorization, configuration and HTTP boundaries;
- product artifact build, packaging, provenance and release workflows;
- repository tooling under `tools/`;
- CI/GitHub Actions and repository governance.

Out of scope: vulnerabilities in dependencies with no demonstrated impact on Nevo SpecFlow, and
scenarios that already assume a compromised maintainer account or compromised GitHub-hosted runner.

## Supported versions

No versions are released yet. Once maintained release lines exist, they will be listed here.
