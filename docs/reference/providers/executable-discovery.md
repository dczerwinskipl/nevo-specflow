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
   every argument. Candidates are verified one at a time in PATH order; the first that works wins
   and nothing after it runs.
3. **Install locations.** The vendor install locations the provider declares, then its npm package
   under the npm global prefix as npm reports it (`npm prefix --global`, run through the `node.exe`
   on PATH and the `npm-cli.js` bundled beside it, so a custom `prefix` in the user's `.npmrc` is
   honoured). When the first `node.exe` on PATH is a version manager's shim with no bundled npm (for
   example Volta or scoop), the prefix resolves to nothing and the npm package is not looked for;
   setting `executable` covers that setup. Among the verified executables found in the install
   locations, the highest version wins (at most four version commands run at once); equal versions
   keep the declared location order, then the newest build.

A `*` location (the Codex app's build folders) lists the folders of its parent, keeps those that
hold the executable, and orders them newest first by the executable's modification time, then the
folder's: build folder names are hashes and say nothing about age. At most the 16 newest builds
are probed; when more exist and none of those works, the result says how many older build folders
were not checked, so a limit never reads as a plain not found. Likewise at most 256 entries of
the parent folder are read; when it holds more, the result says how many and where.

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

- A candidate is a regular file, at most 512 MiB, and the final file itself is not a link. The
  folders on its path may be junctions or links (an app's own folders may be): what decides is where
  the file physically is (see Trust).
- It is verified by running its version command (`--version`) without a shell, with the projected
  provider environment and a 5-second timeout. The output must be the provider's exact version line
  (`codex-cli <version>`, `<version> (Claude Code)`, `<version>`). The command's working folder is
  the system temporary folder, so neither the project nor the executable's own folder supplies
  configuration; nothing is run from there.
- No version range is enforced: no API boundary of a provider is established yet, and an installed
  or tested version is never used as an arbitrary minimum ([compatibility](compatibility.md)).
- When the catalogue records a known-incompatible build for the provider, each candidate is hashed
  and such a build is refused (`KNOWN_INCOMPATIBILITY`). Otherwise nothing is hashed during
  discovery.
- Nothing unverified is ever returned. With no verified candidate, the most specific problem of a
  found executable is reported (incompatible build, then not working), else
  `EXECUTABLE_NOT_FOUND` with every place checked. An npm launcher on PATH whose package lacks its
  native executable is reported as `unresolvedLauncher`, because the CLI then looks installed.

## Trust

Discovery runs only executables the user installed in a fixed, provider-declared place:

- the path the user configured;
- folders the user put on PATH, which is what the user's own shell would run;
- the vendor install locations under the user's profile (`%USERPROFILE%`, `%LOCALAPPDATA%`) and
  the npm global prefix npm reports. These folders are writable by the user, as every per-user
  installer's are; they are trusted to the same degree as the user's own account, not more.

Relative PATH entries, network (UNC) folders, the project workspace and the temporary folders
(`%TEMP%`, `%TMP%` and the system temporary folder) are never run from, because repository content
or any process could have put a file there. The check is physical: before anything runs (the
version check, `node.exe` and `npm-cli.js` for the npm prefix), the candidate's real path is
resolved through every junction and symbolic link and compared with the real paths of those
folders. A PATH folder that is a junction into the project or the temporary folder is therefore
skipped, while a junction to an ordinary install folder keeps working. There is no disk search and
no wildcard other than one `*` folder segment of a declared location.

## Cache

A found executable is kept for the Runtime's lifetime while its file is unchanged (size and
modification time) and, unless it is the configured executable, while its real location still
passes the physical trust check: each read resolves its real path again, so a junction on its path
retargeted into the project or a temporary folder invalidates it and nothing runs from there. An
update that removes or replaces it is discovered again on the next read.
When it came from an install location, every read also lists those locations again (folder
listings and file metadata only; nothing runs) and discovers again when the builds there changed,
so a desktop app update into a new build folder is picked up without a restart. A failure is kept
for 30 seconds, so installing the CLI and rechecking availability finds it without a restart.

**Check again** in the New Session screen reads the catalogue with `recheck=true`: every enabled
provider forgets what it found and discovers and probes again from scratch (for example a CLI
newly put on PATH while an install-location build was in use). Changing `executable` in the local
configuration takes effect after a Runtime restart.

## Catalogue facts

A catalogue entry carries `executable` (`path`, `source`: `configured` | `path` | `discovered`,
the install `location`: `codex-desktop-app` | `claude-native-installer` | `antigravity-installer`
| `npm-global-package`, `version`) once one is found; with `EXECUTABLE_NOT_FOUND` it carries
`checkedLocations` and, for a broken npm install, `unresolvedLauncher` (`path`, `package`)
instead. The UI names each location in its own language. `signInCommand` is the CLI's own sign-in command, with the resolved path
when PATH does not find the command. The New Session agent card shows only a short status; its
**How to fix** details show how the executable was found when the agent is unavailable because of
that executable, and for a CLI that was not found name the kinds of places checked (PATH, the Codex
desktop app, the npm global package) with the full paths behind a disclosure.

## Unavailability reasons

Configuration comes first: `NOT_ALLOWED_BY_PROJECT`, then `NOT_ENABLED_ON_WORKSTATION`, then
`SPECIFICATION_WORKTREE_UNSUPPORTED`, then the readiness reasons below. Every reason has a short card
status and, in its **How to fix** details, what to do, with the Runtime's `reason` as the detail.

| Code                            | Meaning                                                                                                     | What the user can do                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `EXECUTABLE_NOT_FOUND`          | No candidate exists, the configured path is missing, or an npm launcher's package lacks its executable.     | Install (or reinstall) the CLI, or set (or correct) `executable`.    |
| `EXECUTABLE_NOT_WORKING`        | A candidate did not answer its version command, timed out or printed no version.                            | Reinstall or update the CLI, or point `executable` at a working one. |
| `INSTALLATION_UNAVAILABLE`      | A working CLI was found, but its login source, environment or machine-managed policy is not supported.      | Remove what the provider page lists as unsupported.                  |
| `AUTHENTICATION_REQUIRED`       | Readiness `authenticationRequired`: the CLI's login is missing, expired or rejected.                        | Run `signInCommand` and recheck.                                     |
| `PROTOCOL_UNSUPPORTED`          | The CLI answered the probe outside the implemented protocol profile.                                        | Update or downgrade to a supported build.                            |
| `KNOWN_INCOMPATIBILITY`         | The build matches a known-incompatible or revoked catalogue record, or failed mode admission.               | Install another version.                                             |
| `RESTRICTION_UNSUPPORTED`       | A Claude invocation started without the required tools, permission mode or empty MCP and plugin set.        | Update or downgrade to a supported build.                            |
| `PROCESS_SETTLEMENT_UNVERIFIED` | A probe process could not be verified as stopped.                                                           | Wait for it to exit or end it, then recheck.                         |
| `PROBE_FAILED`                  | A verified executable failed the protocol probe for another reason (crash, timeout, account usage refused). | Check that the CLI works in a terminal, then recheck.                |
