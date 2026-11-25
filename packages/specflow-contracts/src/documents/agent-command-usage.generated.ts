// GENERATED from the nevo-specflow program by packages/specflow/src/agent-broker/usage.test.ts.
// Do not edit: regenerate with `pnpm --filter @nevo/specflow exec vitest run src/agent-broker/usage.test.ts -u`.
import type { AgentCommandUsage } from './agent-command-usage';

export const AGENT_COMMAND_USAGE: Readonly<Record<string, AgentCommandUsage>> = {
  "specs list": {
    "arguments": [],
    "options": [
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Output structured JSON"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      }
    ]
  },
  "specs documents list": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on the documents of this Task of the Specification (its main document is \"task\")"
      }
    ]
  },
  "specs documents read": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "document-id",
        "required": true,
        "variadic": false,
        "description": "Document id"
      }
    ],
    "options": [
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on the documents of this Task of the Specification (its main document is \"task\")"
      }
    ]
  },
  "specs documents validate": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "tasks list": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "tasks inspect": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "task-id",
        "required": true,
        "variadic": false,
        "description": "Task id"
      }
    ],
    "options": [
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "workflow actions": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on this Task of the Specification instead of the Specification"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "workflow context": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on this Task of the Specification instead of the Specification"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "docs get": {
    "arguments": [
      {
        "name": "ref",
        "required": true,
        "variadic": true,
        "description": "stable document ids; with --content also <id>#<sectionId> for one section of a document"
      }
    ],
    "options": [
      {
        "flags": "--content",
        "long": "--content",
        "required": false,
        "description": "also print the Markdown of every reference in the given order: the whole document, or the section with its subsections"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "emit JSON on stdout"
      }
    ]
  },
  "docs find": {
    "arguments": [
      {
        "name": "query",
        "required": true,
        "variadic": true,
        "description": "search terms (OR semantics)"
      }
    ],
    "options": [
      {
        "flags": "--type <type>",
        "long": "--type",
        "required": false,
        "description": "filter by doc type"
      },
      {
        "flags": "--status <status>",
        "long": "--status",
        "required": false,
        "description": "filter by status"
      },
      {
        "flags": "--scope <scope>",
        "long": "--scope",
        "required": false,
        "description": "filter by taxonomy scope"
      },
      {
        "flags": "--area <area>",
        "long": "--area",
        "required": false,
        "description": "filter by taxonomy area"
      },
      {
        "flags": "--tag <tag>",
        "long": "--tag",
        "required": false,
        "description": "filter by taxonomy tag"
      },
      {
        "flags": "--limit <n>",
        "long": "--limit",
        "required": false,
        "description": "maximum results; omitted means all matches"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "emit JSON on stdout"
      }
    ]
  },
  "specs documents add": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--path <path>",
        "long": "--path",
        "required": false,
        "description": "Path relative to the Specification folder (the Task folder with --task), e.g. architecture.md, never specs/active/...; required without --template"
      },
      {
        "flags": "--type <typeId>",
        "long": "--type",
        "required": false,
        "description": "Document type id; omitted: unclassified (a template brings its own)"
      },
      {
        "flags": "--template <templateId>",
        "long": "--template",
        "required": false,
        "description": "Template of the archetype of the Specification"
      },
      {
        "flags": "--catalogue-revision <revision>",
        "long": "--catalogue-revision",
        "required": false,
        "description": "Catalogue revision the template was read at (default: the current one)"
      },
      {
        "flags": "--content-file <path>",
        "long": "--content-file",
        "required": false,
        "description": "Read the text from this file"
      },
      {
        "flags": "--stdin",
        "long": "--stdin",
        "required": false,
        "description": "Read the text from standard input"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on the documents of this Task of the Specification (its main document is \"task\")"
      },
      {
        "flags": "--operation-id <uuid>",
        "long": "--operation-id",
        "required": false,
        "description": "Stable operation UUID; reuse it to retry safely"
      },
      {
        "flags": "--wait",
        "long": "--wait",
        "required": false,
        "description": "Drain the commit queue and report the settled commit"
      },
      {
        "flags": "--wait-ms <ms>",
        "long": "--wait-ms",
        "required": false,
        "description": "Longest wait of --wait (default 30000)"
      }
    ]
  },
  "specs documents save": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "document-id",
        "required": true,
        "variadic": false,
        "description": "Document id"
      }
    ],
    "options": [
      {
        "flags": "--expected-revision <revision>",
        "long": "--expected-revision",
        "required": true,
        "description": "Revision of the document you read"
      },
      {
        "flags": "--content-file <path>",
        "long": "--content-file",
        "required": false,
        "description": "Read the text from this file"
      },
      {
        "flags": "--stdin",
        "long": "--stdin",
        "required": false,
        "description": "Read the text from standard input"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on the documents of this Task of the Specification (its main document is \"task\")"
      },
      {
        "flags": "--operation-id <uuid>",
        "long": "--operation-id",
        "required": false,
        "description": "Stable operation UUID; reuse it to retry safely"
      },
      {
        "flags": "--wait",
        "long": "--wait",
        "required": false,
        "description": "Drain the commit queue and report the settled commit"
      },
      {
        "flags": "--wait-ms <ms>",
        "long": "--wait-ms",
        "required": false,
        "description": "Longest wait of --wait (default 30000)"
      }
    ]
  },
  "specs documents classify": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "document-id",
        "required": true,
        "variadic": false,
        "description": "Document id"
      }
    ],
    "options": [
      {
        "flags": "--type <typeId>",
        "long": "--type",
        "required": true,
        "description": "Document type id"
      },
      {
        "flags": "--expected-revision <revision>",
        "long": "--expected-revision",
        "required": true,
        "description": "Revision of the document you read"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on the documents of this Task of the Specification (its main document is \"task\")"
      },
      {
        "flags": "--operation-id <uuid>",
        "long": "--operation-id",
        "required": false,
        "description": "Stable operation UUID; reuse it to retry safely"
      },
      {
        "flags": "--wait",
        "long": "--wait",
        "required": false,
        "description": "Drain the commit queue and report the settled commit"
      },
      {
        "flags": "--wait-ms <ms>",
        "long": "--wait-ms",
        "required": false,
        "description": "Longest wait of --wait (default 30000)"
      }
    ]
  },
  "tasks create": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--id <task-id>",
        "long": "--id",
        "required": true,
        "description": "Task id: lowercase letters, digits and dashes"
      },
      {
        "flags": "--title <title>",
        "long": "--title",
        "required": true,
        "description": "Title"
      },
      {
        "flags": "--type <task-type>",
        "long": "--type",
        "required": true,
        "description": "Task type id (immutable; see \"definitions list\")"
      },
      {
        "flags": "--depends-on <task-id>",
        "long": "--depends-on",
        "required": false,
        "description": "A Task this one waits for (repeatable)"
      },
      {
        "flags": "--content-file <path>",
        "long": "--content-file",
        "required": false,
        "description": "The first text of task.md, read from this file"
      },
      {
        "flags": "--stdin",
        "long": "--stdin",
        "required": false,
        "description": "The first text of task.md, read from standard input"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--summary <text>",
        "long": "--summary",
        "required": false,
        "description": "A short summary"
      },
      {
        "flags": "--context <kind:value>",
        "long": "--context",
        "required": false,
        "description": "A required context entry (repeatable): task-doc|spec-doc|project-doc|path|instructions; prefix artifact: for a process artifact that may not exist yet"
      },
      {
        "flags": "--context-file <path>",
        "long": "--context-file",
        "required": false,
        "description": "YAML/JSON list of context entries (optional entries, notes); entries of --context follow"
      }
    ]
  },
  "tasks edit": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "task-id",
        "required": true,
        "variadic": false,
        "description": "Task id"
      }
    ],
    "options": [
      {
        "flags": "--expected-revision <revision>",
        "long": "--expected-revision",
        "required": true,
        "description": "The revision \"tasks list|inspect\" showed; a stale one is refused"
      },
      {
        "flags": "--title <title>",
        "long": "--title",
        "required": false,
        "description": "New title"
      },
      {
        "flags": "--clear-summary",
        "long": "--clear-summary",
        "required": false,
        "description": "Remove the summary"
      },
      {
        "flags": "--depends-on <task-id>",
        "long": "--depends-on",
        "required": false,
        "description": "The complete list of dependencies (repeatable)"
      },
      {
        "flags": "--no-dependencies",
        "long": "--no-dependencies",
        "required": false,
        "description": "Remove every dependency"
      },
      {
        "flags": "--default-context",
        "long": "--default-context",
        "required": false,
        "description": "Restore the default context"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      },
      {
        "flags": "--summary <text>",
        "long": "--summary",
        "required": false,
        "description": "A short summary"
      },
      {
        "flags": "--context <kind:value>",
        "long": "--context",
        "required": false,
        "description": "A required context entry (repeatable): task-doc|spec-doc|project-doc|path|instructions; prefix artifact: for a process artifact that may not exist yet"
      },
      {
        "flags": "--context-file <path>",
        "long": "--context-file",
        "required": false,
        "description": "YAML/JSON list of context entries (optional entries, notes); entries of --context follow"
      }
    ]
  },
  "tasks remove": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      },
      {
        "name": "task-id",
        "required": true,
        "variadic": false,
        "description": "Task id"
      }
    ],
    "options": [
      {
        "flags": "--expected-revision <revision>",
        "long": "--expected-revision",
        "required": true,
        "description": "The revision \"tasks list|inspect\" showed"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  },
  "workflow finish": {
    "arguments": [
      {
        "name": "spec-id",
        "required": true,
        "variadic": false,
        "description": "Specification UUID"
      }
    ],
    "options": [
      {
        "flags": "--step <step-id>",
        "long": "--step",
        "required": true,
        "description": "The step you worked on"
      },
      {
        "flags": "--attempt <number>",
        "long": "--attempt",
        "required": true,
        "description": "The attempt you worked on (see \"workflow actions\"); a stale one is refused"
      },
      {
        "flags": "--result <result>",
        "long": "--result",
        "required": false,
        "description": "The result the step finishes with (see \"workflow actions\")"
      },
      {
        "flags": "--feedback <text>",
        "long": "--feedback",
        "required": false,
        "description": "Feedback handed to the next step; required by some transitions"
      },
      {
        "flags": "--artifact <ref>",
        "long": "--artifact",
        "required": false,
        "description": "An artifact to hand over (repeatable)"
      },
      {
        "flags": "--tasks-file <path>",
        "long": "--tasks-file",
        "required": false,
        "description": "A step that produces Tasks: YAML/JSON list of the complete draft Tasks"
      },
      {
        "flags": "--task-decisions-file <path>",
        "long": "--task-decisions-file",
        "required": false,
        "description": "A Specification step: YAML/JSON list of Task status decisions"
      },
      {
        "flags": "--changed <path>",
        "long": "--changed",
        "required": false,
        "description": "Inside an agent Turn: a file you changed outside SpecFlow, checkout-relative (repeatable)"
      },
      {
        "flags": "--task <task-id>",
        "long": "--task",
        "required": false,
        "description": "Act on this Task of the Specification instead of the Specification"
      },
      {
        "flags": "--project-root <path>",
        "long": "--project-root",
        "required": false,
        "description": "Require this verified Project Home root"
      },
      {
        "flags": "--json",
        "long": "--json",
        "required": false,
        "description": "Print the result as JSON"
      }
    ]
  }
};
