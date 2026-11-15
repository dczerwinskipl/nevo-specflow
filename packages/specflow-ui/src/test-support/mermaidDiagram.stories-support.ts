/**
 * Fenced Mermaid diagrams shared by the documentation reader and Documents stories so both draw
 * the same ones: the runtime overview of `docs/architecture/overview.md` (wide: it fits down to
 * 10 px text and pans beyond) followed by a small sequence (shown at its natural size).
 */
export const diagramFixture = `\`\`\`mermaid
flowchart LR
  person([Person])
  extagent([External agent])

  subgraph offline["nevo-specflow &lt;command&gt; — short-lived"]
    cmd["offline command"] --> eng1["Engine (library)"]
  end

  subgraph host["nevo-specflow start — long-lived Runtime host"]
    http["HTTP server<br/>/api + built UI"] --> features["Runtime features"]
    features --> eng2["Engine (library)"]
    features --> store[("Session store<br/>SQLite, worker thread")]
  end

  browser["Browser: SpecFlow UI"]
  providers["Provider CLIs<br/>Claude Code, Codex, Antigravity<br/>(child processes)"]
  git[("Git repository<br/>Project Home + worktrees")]

  person --> browser
  person --> offline
  person -- "start" --> host
  extagent --> offline
  browser -- "HTTP JSON + SSE" --> http
  features -- "spawn, stdio, process tree" --> providers
  eng1 --> git
  eng2 --> git
  providers -- "work in the bound workspace" --> git
\`\`\`

Saving a document:

\`\`\`mermaid
sequenceDiagram
  participant UI
  participant Runtime
  UI->>Runtime: Save
  Runtime-->>UI: Saved
\`\`\``;
