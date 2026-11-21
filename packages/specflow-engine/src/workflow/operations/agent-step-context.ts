import type { TaskContextEntry, TaskContextKind } from '../../tasks/resource/model';

/**
 * The data an agent attempt works from, beyond the step contract (D13). The Engine owns it; the
 * Runtime renders the brief from it. References carry digests, not content: only `instructions`
 * entries and the catalogue texts are inline. Every list is in a deterministic order.
 */

/** A registered document of the subject; the path is relative to the workspace the Turn runs in. */
export interface ContextDocument {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly path: string;
  readonly revision: string;
  /** The file still holds only the initial content the Engine wrote from a template. */
  readonly templateOnly: boolean;
}

/** A document type the agent may register (`documents add --type <id>`). */
export interface ContextDocumentType {
  readonly id: string;
  readonly title: string;
  readonly useWhen: string;
  readonly instructions: string;
  readonly defaultFilename?: string;
}

/** What the Specification's archetype scaffolds and requires. */
export interface ContextArchetype {
  readonly id: string;
  readonly requirements: readonly { readonly documentType: string; readonly minCount: number }[];
  readonly templates: readonly {
    readonly id: string;
    readonly documentType: string;
    readonly filename: string;
    readonly title?: string;
    readonly include: 'always' | 'optional';
    readonly instructions?: string;
  }[];
}

/**
 * One resolved reference of the Task's context. `path` is workspace-relative (a file); `sha256` and
 * `bytes` describe that file, or, for a folder or glob, the sorted list of its files (`files`). A
 * project document is pinned by its id alone: the Engine does not read the project documentation, so
 * a change of its content does not change the digest.
 */
export interface ContextReference {
  readonly kind: Exclude<TaskContextKind, 'instructions'>;
  /** The document id, or the path or glob. */
  readonly ref: string;
  readonly path?: string;
  readonly sha256?: string;
  readonly bytes?: number;
  /** A folder or a glob: how many files `sha256` covers. */
  readonly files?: number;
  readonly required: boolean;
  /** An optional reference that does not resolve now (a required one refuses the context). */
  readonly missing?: true;
}

export interface ContextInstructions {
  readonly kind: 'instructions';
  readonly text: string;
  readonly required: boolean;
}

export type ContextEntry = ContextReference | ContextInstructions;

/** The agent data of one step context. */
export interface AgentStepContext {
  readonly documents: readonly ContextDocument[];
  readonly documentTypes: readonly ContextDocumentType[];
  readonly archetype?: ContextArchetype;
  /** For a Task: the resolved context in its declared order (absent for a Specification step). */
  readonly taskContext?: {
    readonly entries: readonly ContextEntry[];
    /**
     * sha256 of the canonical JSON (sorted keys) of `entries`: the order, each reference's kind, ref,
     * file digest, size, `required` and `missing`, and the inline instruction texts. It changes when a
     * referenced file (or a file of a referenced folder or glob) changes; what an attempt records.
     */
    readonly digest: string;
  };
}

/**
 * What a reference resolved to. A file: `path`, its `bytes` and `sha256`. A folder or a glob: no
 * `path`; `files` is the number of files it names, `bytes` their total size and `sha256` the digest of
 * the sorted list of `{path, sha256}`, so a changed, added or removed file changes it. `sha256` is
 * absent only when a budget was exceeded (the context is refused then).
 */
export interface ContextFileFact {
  readonly path?: string;
  readonly bytes: number;
  readonly sha256?: string;
  readonly files?: number;
}

/** The aggregate bytes the files of one context may still be hashed with; spent by the source. */
export interface HashBudget {
  remaining: number;
}

/** One context entry as it was looked up: `found` is absent when it does not resolve. */
export interface ContextEntryFact {
  readonly entry: TaskContextEntry;
  readonly found?: { readonly file?: ContextFileFact };
}

/** Everything `compileAgentContext` needs, already read. */
export interface AgentContextFacts {
  readonly documents: readonly ContextDocument[];
  readonly documentTypes: readonly ContextDocumentType[];
  readonly archetype?: ContextArchetype;
  readonly taskId?: string;
  readonly entries?: readonly ContextEntryFact[];
}
