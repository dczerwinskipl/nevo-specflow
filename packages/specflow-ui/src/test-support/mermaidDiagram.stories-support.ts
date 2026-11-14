/**
 * A fenced Mermaid diagram (the runtime overview of `docs/architecture/overview.md`, shortened),
 * shared by the documentation reader and Documents stories so both draw the same diagram.
 */
export const diagramFixture = `\`\`\`mermaid
flowchart LR
  person([Person])

  subgraph host["nevo-specflow start — long-lived Runtime host"]
    http["HTTP server<br/>/api + built UI"] --> features["Runtime features"]
    features --> eng["Engine (library)"]
    features --> store[("Session store<br/>SQLite, worker thread")]
  end

  browser["Browser: SpecFlow UI"]
  providers["Provider CLIs<br/>Claude Code, Codex, Antigravity<br/>(child processes)"]
  git[("Git repository<br/>Project Home + worktrees")]

  person --> browser
  person -- "start" --> host
  browser -- "HTTP JSON + SSE" --> http
  features -- "spawn, stdio, process tree" --> providers
  eng --> git
  providers -- "work in the bound workspace" --> git
\`\`\``;

/** A diagram with a syntax error: it stays code with the "could not be rendered" note. */
export const brokenDiagramFixture = `\`\`\`mermaid
flowchart LR
  a -->
\`\`\``;
