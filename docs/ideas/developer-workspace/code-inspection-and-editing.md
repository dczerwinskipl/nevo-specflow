---
id: ideas.developer-workspace.code-inspection-and-editing
type: architecture
title: Code inspection, editing, and full IDE integration
status: draft
scope: specflow
areas:
  - ui
  - server
  - runtime
  - configuration
  - security
tags:
  - monaco
  - vscode
  - lsp
  - worktree
  - file-reference
  - remote-development
read_when:
  - implementing links from agent output or findings to source files
  - adding an embedded code viewer or editor to SpecFlow
  - integrating a browser-accessible IDE with the current worktree
  - designing language-support or IDE extension points
summary: >
  Use the current SpecFlow worktree as the shared filesystem source of truth, expose a compact
  React/Monaco code surface for review and small edits, and open a separate VS Code-based full IDE
  for project-wide work, terminal use, source control, and extensions.
related:
  - ideas.developer-workspace
  - ideas.readme
  - architecture.runtime.ownership-and-lifecycle
---

# Code inspection, editing, and full IDE integration

## Goal

A user may be following a SpecFlow session from the same machine, another laptop, or a phone while
an agent works on code hosted by the machine running SpecFlow.

The candidate experience should support:

- clicking a source reference from an agent message or finding;
- opening that file at the referenced line in a compact code surface inside SpecFlow;
- inspecting diagnostics and project-aware language information;
- making and saving a small manual correction;
- escalating to a full browser IDE for project-wide navigation, source control, extensions, or a
  terminal.

The code remains on the host running SpecFlow. A remote browser is a client, not a second checkout or a
file-sync mechanism.

## Two interaction modes

### Compact code surface

The compact surface is intended for review and small corrections next to the current SpecFlow
context.

Candidate capabilities:

- render as a normal React/DOM element, not an iframe;
- use Monaco or an equivalent embeddable editor;
- open a source reference at a line and optional column;
- syntax highlighting;
- project-aware completion and diagnostics where a language provider is available;
- read and save the actual file under the current worktree root;
- show enough file identity and dirty state that the user understands what will be saved;
- offer **Open full IDE** when the compact interaction is no longer sufficient.

The compact surface is deliberately not a miniature IDE. File explorer, source-control UI,
multi-tab workspaces, terminal, debugger, extension management, and complete VS Code navigation are
not required here.

Cross-file navigation such as go-to-definition may be added when it improves the experience, but it
is not required for the initial design. A navigation result may instead offer to open the target in
the full IDE.

### Full IDE

The full mode should be VS Code-based and open as a separate page, route, or browser tab rather than
embedding an entire workbench in an iframe beside the session.

The intended capabilities are the ones already solved by the IDE ecosystem:

- project explorer and search;
- multiple editors and diff views;
- source control;
- integrated terminal;
- language and framework extensions;
- project-wide navigation and refactoring;
- extension configuration owned by the user or a Nevo integration package.

The current preference is to evaluate an official VS Code Server / browser client path first because
normal VS Code extension compatibility is valuable. OpenVSCode Server or code-server remain fallback
candidates if the official server cannot provide acceptable routing, deep linking, authentication,
or lifecycle control. A code-server PoC is evidence for the interaction model, not a provider
decision.

## Workspace ownership

For this proposal, the local SpecFlow Runtime resolves and exposes the current workspace root to
file/editor capabilities. This does not make filesystem path text the durable identity of a
workspace or worktree.

For the initial model this is simply:

```text
currentWorkspaceRoot = root of the currently active worktree
```

Every compact file operation and every full-IDE launch is resolved against that same root.

The browser does not receive or choose arbitrary host filesystem roots. Absolute host paths should
remain an implementation detail of the local Runtime boundary.

Multi-worktree selection is a later capability. The current design should not prevent introducing a
stable workspace/worktree identity later, but it does not require that identity in the initial UI
contract.

## File references

Agent output, findings, and UI navigation should use workspace-relative file references rather than
absolute host paths.

Candidate shape:

```ts
type FileReference = {
  path: string;
  line?: number;
  column?: number;
};
```

The backend resolves `path` relative to `currentWorkspaceRoot`.

Resolution must stay inside that root. A later implementation must canonicalize paths and define
symlink handling before exposing arbitrary file read/write remotely.

If multiple simultaneously addressable worktrees are introduced, the reference can gain a stable
workspace/worktree identity without exposing the physical root path.

## Saved files are the shared source of truth

Compact editor buffers and full-IDE buffers do not need live synchronization.

The simple model is:

```text
compact editor ---- save ----\
                             > current worktree filesystem
full IDE ----------- save ----/
agent -------------- write ---/
```

Saved files on disk are canonical. Unsaved buffers are private to the client that owns them.

This deliberately avoids a shared document server, CRDT, or LSP multiplexer. If two clients edit the
same file without saving, they may have different local buffers. Once a file is saved, other clients
can discover the filesystem change.

## Shared backend responsibilities

The useful reuse boundary is the workspace/runtime layer, not a single shared IDE engine.

Candidate shared responsibilities:

- current worktree root;
- bounded file read/write;
- filesystem change observation;
- git/worktree context where needed;
- host execution environment;
- configuration;
- resolution of a file reference into a full-IDE deep link;
- later, common authentication and remote-access routing.

A backend abstraction such as `FullIdeProvider` can keep provider-specific URL, process, and
lifecycle details out of React.

The frontend should ask to open:

```text
path + line + column
```

and should not construct code-server, OpenVSCode, or VS Code Server URLs itself.

## Language support in the compact surface

Monaco alone is not enough for project-aware behavior.

The compact editor should connect to a language service that runs on the host running SpecFlow and sees
the current worktree, project files, package references, generated configuration, and other inputs
that the normal developer environment requires.

For TypeScript this can be a TypeScript language server. Other stacks may register other language
providers.

A candidate extension point is therefore broader than a hardcoded list of languages. A Nevo
integration package may eventually declare both:

- compact language support, such as an LSP/runtime provider;
- full-IDE extension recommendations or requirements.

For example, a .NET integration could provide a compact Roslyn/LSP runtime and recommend the normal
VS Code .NET extensions for the full IDE. The exact package/configuration contract remains open.

Do not assume that installing a VS Code extension automatically makes its language features
available to embedded Monaco. The full IDE owns its extension host; the compact surface may run a
separate language-server process.

That means compact and full modes may have two language-server processes for the same worktree.
This is acceptable: it duplicates runtime processes, not Nevo domain logic. Sharing one LSP instance
between independent editor clients would introduce document-state arbitration that is not needed for
the proposed use case.

Language runtimes should eventually start lazily and stop after an idle period so multiple
worktrees/languages do not leave unbounded background processes.

## Host execution semantics

The full IDE and its terminal should execute against the environment hosting the current worktree.

A client device does not determine shell syntax or SDK availability.

For example:

```text
Fold browser
    |
MacBook browser
    |
    v
Windows PC running local SpecFlow runtime + current worktree
    |
    +-- VS Code server
    +-- terminal / PowerShell
    +-- dotnet / node / git installed on that PC
```

If local SpecFlow runtime later owns workspaces inside containers or another execution environment, the IDE,
terminal, agent execution, and manual verification commands should target that same environment
where practical. A browser-only Docker IDE mounted over host files is not sufficient evidence that
commands behave like the host.

## Extension model

Extension support is an explicit extension point, not something SpecFlow should reimplement.

The intended direction is:

- the full IDE uses a VS Code-compatible extension ecosystem;
- a user can install/configure extensions appropriate for their stack;
- Nevo packages may recommend or provision IDE extensions;
- a package may separately register compact-editor language support;
- SpecFlow core remains language/framework neutral.

The exact configuration syntax, lifecycle, version pinning, and distinction between recommended and
required extensions are not decided yet.

## External file changes

An agent, the compact editor, the full IDE, or another local tool can save a file while another
client has it open.

This does not require live collaborative editing.

A later implementation can add a filesystem watcher under the workspace runtime and publish a
one-way SSE notification, for example:

```json
{
  "type": "workspace.file.changed",
  "path": "src/example.ts",
  "version": "content-hash-or-version",
  "changedAt": "..."
}
```

The event does not need to know who changed the file.

Candidate UI behavior:

- clean buffer: refresh automatically or show a lightweight changed-on-disk indicator;
- dirty buffer: warn that the disk version changed and require an explicit reload/keep/compare
  choice before overwriting it.

SSE is sufficient for this notification because the event flows from the host to the browser.
Interactive language protocols and terminal sessions may use WebSockets independently.

## Remote access and security

Once SpecFlow exposes file editing or a terminal outside localhost, it effectively exposes remote
development access to the host.

Before that becomes a supported capability, the design needs:

- authentication;
- TLS or an authenticated tunnel;
- one controlled gateway/origin where practical;
- WebSocket/SSE authentication;
- canonical path-boundary checks;
- explicit terminal/process authorization;
- a decision about whether full IDE authentication is delegated to the provider or fronted by Nevo.

A PoC on a trusted development network is not the security model.

## Proof-of-concept scope

An external PoC has been prepared but has not yet been user-tested.

It currently aims to prove:

1. a mock agent session can emit a file/line reference;
2. clicking the reference opens a compact React/Monaco editor without an iframe;
3. a real TypeScript language server sees enough of the project to produce cross-file-aware
   diagnostics/completion;
4. saving changes the actual workspace file;
5. **Open full IDE** opens a VS Code-like workbench against the same workspace;
6. the compact interaction remains usable from a phone-sized browser.

The current PoC uses code-server only as a convenient full-IDE test provider. It should not be read
as a provider choice.

A useful next PoC should also test C#/.NET, because project loading and language services are more
demanding there than the TypeScript happy path.

## Non-goals for the initial implementation

- synchronized unsaved buffers across clients;
- collaborative multi-user editing;
- a full explorer or terminal inside the compact panel;
- perfect feature parity between Monaco and VS Code;
- implementing a VS Code extension host in SpecFlow;
- solving multiple simultaneously active worktrees before the current-worktree flow is useful;
- attributing every filesystem change to a specific agent or user.

## Open decisions

The main unresolved questions are:

1. **Full IDE provider:** can official VS Code Server be controlled well enough for lifecycle,
   routing, deep links, authentication, and opening the current worktree?
2. **Extension contract:** how should Nevo packages recommend/provision VS Code extensions and
   register compact language providers without coupling core to specific stacks?
3. **C# compact support:** which Roslyn/LSP path provides acceptable project-aware behavior and
   startup cost?
4. **Mobile UX:** is Monaco comfortable enough on the target phone/Fold layout for review and small
   corrections?
5. **Remote exposure:** what authenticated tunnel/gateway model should Nevo support when the UI is
   used away from the host network?
6. **Worktree identity:** when multiple worktrees become addressable at once, what stable identity
   should file references and IDE launches use?

These should be resolved from a working PoC and the actual local runtime/worktree implementation rather
than by expanding the compact surface into a custom IDE.
