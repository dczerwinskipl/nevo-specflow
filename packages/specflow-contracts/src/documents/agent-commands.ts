/**
 * The commands an agent may run inside a Turn (D11 point 2, D13): the one table the CLI routing
 * (`packages/specflow/src/agent-broker/routing.ts`) and the Runtime's agent brief both read, keyed
 * by command path. A command is a local `read` or a `brokered` write; any command not in the table
 * is refused. The brief renders only entries that carry a `form`, so it never lists a command the
 * routing refuses.
 */
export type AgentCommandPlacement = 'read' | 'brokered';

/** What a form is rendered for. `taskId` is set when the Turn's subject is a Task. */
export interface AgentFormContext {
  readonly specId: string;
  readonly taskId?: string;
  /** The bound attempt's step and number (`workflow finish`), for an agent attempt. */
  readonly attempt?: { readonly step: string; readonly attempt: number };
  /** Archetype template ids `documents add --template` may name (Specification subject only). */
  readonly templateIds?: readonly string[];
  /** The step produces Tasks: the document writes may name one of its Task drafts (`--task`). */
  readonly draftTasks?: boolean;
  /**
   * The result values `workflow finish --result` takes for the bound step, in declared order; empty:
   * the step has a single exit and the finish names no result.
   */
  readonly results?: readonly string[];
}

export interface AgentCommandEntry {
  readonly placement: AgentCommandPlacement;
  /** For a brokered write: the broker operation that carries it (checked against the Turn scope). */
  readonly operation?:
    | 'documents.create'
    | 'documents.save'
    | 'documents.classify'
    | 'tasks.create'
    | 'tasks.edit'
    | 'tasks.remove'
    | 'workflow.finish';
  /** The exact CLI form the brief shows (without the executable); absent: not shown in the brief. */
  readonly form?: (context: AgentFormContext) => string;
  readonly purpose?: string;
}

const task = (context: AgentFormContext): string =>
  context.taskId === undefined ? '' : ` --task ${context.taskId}`;

/** A document write: the Task subject, or optionally a Task draft of a producing step. */
const documentTask = (context: AgentFormContext): string =>
  context.taskId === undefined && context.draftTasks ? ' [--task <draft-task-id>]' : task(context);

/** `--result` with the step's values, or nothing for a step with a single exit. */
const finishResult = (context: AgentFormContext): string =>
  context.results === undefined
    ? ' --result <result>'
    : context.results.length === 0
      ? ''
      : ` --result ${context.results.length === 1 ? context.results[0]! : `(${context.results.join(' | ')})`}`;

/**
 * The longest shell command an agent's provider approves (Claude Code's Bash tool; bytes of UTF-8).
 * A longer one is refused before it runs, so document text goes in a file (`--content-file`).
 */
export const AGENT_COMMAND_MAX_BYTES = 7000;

/**
 * Where an agent writes the files it passes with `--content-file` / `--tasks-file`: inside its
 * worktree (its file tools reach nothing outside), under `.nevo/local/`, which a Project Home must
 * have Git-ignored, so the files never count as changes nor land in a commit.
 */
export const AGENT_SCRATCH_DIRECTORY = '.nevo/local/scratch';

export const AGENT_COMMANDS: Readonly<Record<string, AgentCommandEntry>> = {
  'specs list': { placement: 'read', form: () => 'specs list', purpose: 'List Specifications.' },
  'specs documents list': {
    placement: 'read',
    form: (c) => `specs documents list ${c.specId}${task(c)}`,
    purpose: 'List documents.',
  },
  'specs documents read': {
    placement: 'read',
    form: (c) => `specs documents read ${c.specId} <document-id>${task(c)}`,
    purpose: 'Read one document.',
  },
  'specs documents validate': {
    placement: 'read',
    form: (c) => `specs documents validate ${c.specId}`,
    purpose: 'Check documents against the archetype.',
  },
  'specs documents status': { placement: 'read' },
  'tasks list': {
    placement: 'read',
    form: (c) => `tasks list ${c.specId}`,
    purpose: 'List Tasks.',
  },
  'tasks inspect': {
    placement: 'read',
    form: (c) => `tasks inspect ${c.specId} <task-id>`,
    purpose: 'Inspect a Task.',
  },
  'workflow actions': {
    placement: 'read',
    form: (c) => `workflow actions ${c.specId}${task(c)}`,
    purpose: 'See the available actions.',
  },
  'workflow context': {
    placement: 'read',
    form: (c) => `workflow context ${c.specId}${task(c)}`,
    purpose: 'See the step context.',
  },
  'project inspect': { placement: 'read' },
  'definitions list': { placement: 'read' },
  'definitions show': { placement: 'read' },
  'definitions validate': { placement: 'read' },
  'commit status': { placement: 'read' },
  'docs list': { placement: 'read' },
  'docs get': {
    placement: 'read',
    form: () => 'docs get <ref...> --content',
    purpose: 'Read repository documentation (a document id, or <id>#<sectionId>).',
  },
  'docs find': {
    placement: 'read',
    form: () => 'docs find <query...>',
    purpose: 'Find repository documentation.',
  },
  'docs context': { placement: 'read' },
  'docs search': {
    placement: 'read',
    form: () => 'docs search <question...>',
    purpose:
      'Ask a question about the repository in your own words; it ends with the docs get command that reads the matching sections.',
  },
  'specs documents add': {
    placement: 'brokered',
    operation: 'documents.create',
    form: (c) =>
      `specs documents add ${c.specId}${documentTask(c)} --path <path> (--content-file <file> | --stdin${
        c.taskId === undefined && c.templateIds?.length ? ' | --template <template-id>' : ''
      }) [--type <type>]`,
    purpose:
      'Create a document and register it. --path is relative to the Specification folder (the Task folder with --task), for example architecture.md, never specs/active/....',
  },
  'specs documents save': {
    placement: 'brokered',
    operation: 'documents.save',
    form: (c) =>
      `specs documents save ${c.specId} <document-id>${documentTask(c)} --expected-revision <revision> (--content-file <file> | --stdin)`,
    purpose: 'Replace the content of a registered document; the revision comes from a read.',
  },
  'specs documents classify': {
    placement: 'brokered',
    operation: 'documents.classify',
    form: (c) =>
      `specs documents classify ${c.specId} <document-id>${documentTask(c)} --type <type> --expected-revision <revision>`,
    purpose: 'Give a registered document its type.',
  },
  'tasks create': {
    placement: 'brokered',
    operation: 'tasks.create',
    form: (c) =>
      `tasks create ${c.specId} --id <task-id> --title <title> --type <task-type> [--summary <text>] [--depends-on <task-id>] [--content-file <file> | --stdin]`,
    purpose:
      'Draft a Task of this step (it stays a draft; list it in your finish to keep it, the owner approves it).',
  },
  'tasks edit': {
    placement: 'brokered',
    operation: 'tasks.edit',
    form: (c) =>
      `tasks edit ${c.specId} <task-id> --expected-revision <revision> [--title <title>] [--summary <text>] [--depends-on <task-id>]`,
    purpose:
      'Change a draft Task this step drafted (in any attempt); the revision comes from "tasks inspect".',
  },
  'tasks remove': {
    placement: 'brokered',
    operation: 'tasks.remove',
    form: (c) => `tasks remove ${c.specId} <task-id> --expected-revision <revision>`,
    purpose:
      'Delete a draft Task this step drafted (in any attempt). An approved or started Task stays: propose closing it in your finish instead.',
  },
  'workflow finish': {
    placement: 'brokered',
    operation: 'workflow.finish',
    form: (c) =>
      `workflow finish ${c.specId}${task(c)} --step ${c.attempt?.step ?? '<step-id>'} --attempt ${
        c.attempt !== undefined ? String(c.attempt.attempt) : '<number>'
      }${finishResult(c)} [--feedback <text>] [--artifact <ref>] [--tasks-file <file>] [--changed <path>]`,
    purpose:
      'Propose the result of your attempt once its work is done; name every file you changed outside SpecFlow with --changed. It is applied after you stop.',
  },
};

const pathsOf = (placement: AgentCommandPlacement): ReadonlySet<string> =>
  new Set(
    Object.entries(AGENT_COMMANDS)
      .filter(([, entry]) => entry.placement === placement)
      .map(([path]) => path),
  );

export const AGENT_READ_COMMANDS: ReadonlySet<string> = pathsOf('read');
export const AGENT_BROKERED_COMMANDS: ReadonlySet<string> = pathsOf('brokered');
