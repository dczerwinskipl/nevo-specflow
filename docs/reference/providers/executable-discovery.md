---
id: reference.providers.executable-discovery
type: reference
title: Provider executable discovery and unavailability reasons
status: current
scope: specflow
areas: [ai, runtime, security, configuration]
tags: [providers, discovery, executable, sessions]
read_when:
  - a provider CLI is installed but the catalogue says it is not found or not working
  - adding or changing a provider's install locations or version check
  - changing what the provider catalogue says about an unavailable provider
summary: >
  How the Runtime finds and verifies each provider's CLI (configured path, PATH, vendor install
  locations), which locations are trusted and why, how a candidate is chosen and cached, and the
  catalogue's unavailability reason codes with what the user can do about each.
related:
  - reference.providers.compatibility
  - reference.providers.claude
  - reference.providers.codex
  - reference.providers.antigravity
  - reference.api.sessions
---

# Provider executable discovery and unavailability reasons

Code: `features/sessions/providers/executable/` (shared mechanism) and each provider's
`executable.ts` (its declaration). Discovery runs before a provider's installation inspection;
the inspection, fingerprint and protocol probe then work on the one executable discovery returned.

## Order

1. **Configured.** `sessions.providers.<provider>.executable` in `.nevo/local/config.yaml` is the
   only candidate when set. It is verified like any other and is never silently replaced: a missing
   or failing configured executable makes the provider unavailable, even when another copy is
   installed.
2. **PATH.** Each absolute folder of the projected `PATH`, in order: `<command>.exe`, or an npm
   launcher (`<command>.cmd` / `.bat`) resolved to its package's native executable in the same
   folder (the npm global prefix). A launcher script itself is never run: `cmd.exe` would re-parse
   every argument. The first verified executable in PATH order wins.
3. **Install locations.** The vendor install locations the provider declares, then its npm package
   under the npm global prefix as npm reports it (`npm prefix --global`, run through the `node.exe`
   on PATH and the `npm-cli.js` bundled beside it, so a custom `prefix` or a Node version manager is
   honoured). Among the verified executables found there, the highest version wins; equal versions
   keep the declared location order, then folder name order.

| Provider    | Command  | Install locations (Windows x64)                                                                                                                                                                                    |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude      | `claude` | Native installer `%USERPROFILE%\.local\bin\claude.exe`; npm `@anthropic-ai/claude-code\bin\claude.exe` (replaced by its install script with the native binary).                                                    |
| Codex       | `codex`  | Codex desktop app (Microsoft Store `OpenAI.Codex`) `%LOCALAPPDATA%\OpenAI\Codex\bin\<build hash>\codex.exe`, one folder per app update; npm `@openai/codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`. |
| Antigravity | `agy`    | Antigravity CLI installer `%LOCALAPPDATA%\agy\bin\agy.exe`. Not distributed through npm.                                                                                                                           |

The Codex npm platform package is looked for nested under `@openai/codex`, hoisted beside it, and in
the package's own `vendor` folder, as its launcher does. The macOS app bundles are not listed: the
adapters run on Windows x64 only, and discovery refuses other platforms with
`INSTALLATION_UNAVAILABLE`.

## Verification and choice

- A candidate is a regular file (not a link or junction), at most 512 MiB.
- It is verified by running its version command (`--version`) without a shell, with the projected
  provider environment, in the system temporary folder, with a 5-second timeout; at most four run at
  once per provider. The output must be the provider's exact version line (`codex-cli <version>`,
  `<version> (Claude Code)`, `<version>`).
- A version outside the provider's known API boundaries in the compatibility catalogue is refused
  (`VERSION_UNSUPPORTED`). No boundary is recorded yet: an installed or tested version is never used
  as an arbitrary minimum ([compatibility](compatibility.md)).
- When the catalogue records a known-incompatible build for the provider, each candidate is hashed
  and such a build is refused (`KNOWN_INCOMPATIBILITY`). Otherwise nothing is hashed during
  discovery.
- Nothing unverified is ever returned. With no verified candidate, the most specific problem of a
  found executable is reported (version, then incompatible build, then not working), else
  `EXECUTABLE_NOT_FOUND` with every place checked.

## Trust

Discovery runs only executables the user installed in a fixed, provider-declared place:

- the path the user configured;
- folders the user put on PATH, which is what the user's own shell would run; relative entries,
  network (UNC) folders and folders inside the project workspace are skipped, because repository
  content must never choose the executable;
- the vendor install locations under the user's profile (`%USERPROFILE%`, `%LOCALAPPDATA%`) and
  the npm global prefix npm reports. These folders are writable by the user, as every per-user
  installer's are; they are trusted to the same degree as the user's own account, not more.

There is no disk search, no wildcard other than one `*` folder segment of a declared location (at
most 16 folders), and no execution from the workspace or a temporary folder.

## Cache

A found executable is kept for the Runtime's lifetime while its file is unchanged (size and
modification time); an update that removes or replaces it is discovered again on the next check.
A failure is kept for 30 seconds, so installing the CLI and rechecking availability finds it
without a restart. Changing `executable` in the local configuration takes effect after a Runtime
restart.

## Catalogue facts

A catalogue entry carries `executable` (`path`, `source`: `configured` | `path` | `discovered`,
the install `location` label, `version`) once one is found; with `EXECUTABLE_NOT_FOUND` it carries
`checkedLocations` instead. `signInCommand` is the CLI's own sign-in command, with the resolved path
when PATH does not find the command. The New Session provider tile shows how the executable was
found.

## Unavailability reasons

Configuration comes first: `NOT_ALLOWED_BY_PROJECT`, then `NOT_ENABLED_ON_WORKSTATION`, then
`SPECIFICATION_WORKTREE_UNSUPPORTED`, then the readiness reasons below. Every reason has a short tile
status and a what-to-do hint in the UI, with the Runtime's `reason` as the detail.

| Code                            | Meaning                                                                                                     | What the user can do                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `EXECUTABLE_NOT_FOUND`          | No candidate exists, or the configured path is missing.                                                     | Install the CLI, or set (or correct) `executable`.                   |
| `EXECUTABLE_NOT_WORKING`        | A candidate did not answer its version command, timed out or printed no version.                            | Reinstall or update the CLI, or point `executable` at a working one. |
| `VERSION_UNSUPPORTED`           | The found version is outside the recorded range; the reason names both.                                     | Install a supported version.                                         |
| `INSTALLATION_UNAVAILABLE`      | A working CLI was found, but its login source, environment or machine-managed policy is not supported.      | Remove what the provider page lists as unsupported.                  |
| `AUTHENTICATION_REQUIRED`       | Readiness `authenticationRequired`: the CLI's login is missing, expired or rejected.                        | Run `signInCommand` and recheck.                                     |
| `PROTOCOL_UNSUPPORTED`          | The CLI answered the probe outside the implemented protocol profile.                                        | Update or downgrade to a supported build.                            |
| `KNOWN_INCOMPATIBILITY`         | The build matches a known-incompatible or revoked catalogue record, or failed mode admission.               | Install another version.                                             |
| `RESTRICTION_UNSUPPORTED`       | A Claude invocation started without the required tools, permission mode or empty MCP and plugin set.        | Update or downgrade to a supported build.                            |
| `PROCESS_SETTLEMENT_UNVERIFIED` | A probe process could not be verified as stopped.                                                           | Wait for it to exit or end it, then recheck.                         |
| `PROBE_FAILED`                  | A verified executable failed the protocol probe for another reason (crash, timeout, account usage refused). | Check that the CLI works in a terminal, then recheck.                |
