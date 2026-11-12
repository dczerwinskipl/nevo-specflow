import {
  createTask,
  editTask,
  inspectActions,
  inspectExecution,
  removeTask,
  setTaskStatus,
  WorkflowError,
  type TaskDecisionStatus,
} from '@nevo/specflow-engine';
import { Command, InvalidArgumentError } from 'commander';

import { readContentInput } from '../documents/content-input';
import {
  openExecution,
  reportingWorkflowRefusals,
  type ExecutionOutput,
  type ExecutionSession,
} from '../execution-session';
import { localOwner } from '../local-actor';
import { actionLines } from '../workflow/present';
import { collectContext, contextOf, type TaskContextEntry } from './context-input';
import { editTaskInput } from './edit-input';
import { listLines, resourceLines, taskDetailLines } from './present';

export interface TasksCommandContext extends ExecutionOutput {
  readonly cwd: string;
  /** Reads all of standard input (`--stdin`). */
  readonly readStdin?: () => Promise<string>;
  /** The OS user behind the owner actor; the installed user unless a test supplies one. */
  readonly osUser?: string;
}

interface CommonOptions {
  readonly projectRoot?: string;
  readonly json?: boolean;
}

interface DescribeOptions extends CommonOptions {
  readonly summary?: string;
  readonly context?: TaskContextEntry[];
  readonly contextFile?: string;
  readonly dependsOn?: string[];
}

/** The `tasks status` verbs and the status each sets. */
const STATUS_VERBS: Readonly<Record<string, TaskDecisionStatus>> = {
  approve: 'ready',
  hold: 'on-hold',
  resume: 'ready',
  cancel: 'cancelled',
};

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * `nevo-specflow tasks ...`: the Tasks of a Specification as resources the owner creates, edits,
 * approves and removes, offline, through the Engine's Task use cases (no Runtime, no Specification
 * run needed). Every write is made by the local owner actor (`local:<os-user>`, `trust: local`).
 * An edit and a removal name the revision `tasks list|inspect` shows; a stale one is refused with
 * `WORKFLOW_TASK_REVISION_CONFLICT`. The text of a Task is edited with
 * `specs documents save <spec-id> task --task <task-id>`.
 *
 * Exit codes: 0 success; 1 a refusal (`CODE: message` on stderr) or another failure; 2 a usage error.
 */
export function createTasksCommand(context: TasksCommandContext): Command {
  const owner = () => localOwner(context.osUser);
  const tasks = new Command('tasks').description(
    'Create, inspect, edit, approve and remove the Tasks of a Specification (offline, through the Engine)',
  );

  const common = (command: Command): Command =>
    command
      .option('--project-root <path>', 'Require this verified Project Home root')
      .option('--json', 'Print the result as JSON');
  const describing = (command: Command): Command =>
    command
      .option('--summary <text>', 'A short summary')
      .option(
        '--context <kind:value>',
        'A required context entry (repeatable): task-doc|spec-doc|project-doc|path|instructions',
        collectContext,
        [] as TaskContextEntry[],
      )
      .option(
        '--context-file <path>',
        'YAML/JSON list of context entries (optional entries, notes); entries of --context follow',
      );

  const run = (
    options: CommonOptions,
    body: (session: ExecutionSession) => Promise<void>,
  ): Promise<void> =>
    reportingWorkflowRefusals(context, options.json, async () =>
      body(await openExecution(context.cwd, options.projectRoot)),
    );

  const emit = (options: CommonOptions, json: unknown, lines: readonly string[]): void => {
    if (options.json) {
      context.stdout(JSON.stringify(json));
    } else {
      for (const line of lines) {
        context.stdout(line);
      }
    }
  };

  common(
    tasks
      .command('list')
      .description('List the Tasks of a Specification with their status and position')
      .argument('<spec-id>', 'Specification UUID'),
  ).action(async (specId: string, options: CommonOptions) => {
    await run(options, async ({ workflow }) => {
      const inspection = await inspectExecution(workflow, specId);
      emit(options, inspection, listLines(inspection));
    });
  });

  common(
    tasks
      .command('inspect')
      .description('Show one Task: its data, revision and the actions available now')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<task-id>', 'Task id'),
  ).action(async (specId: string, taskId: string, options: CommonOptions) => {
    await run(options, async ({ workflow }) => {
      const inspection = await inspectExecution(workflow, specId);
      const task = inspection.tasks.find((candidate) => candidate.record.taskId === taskId);
      if (task === undefined) {
        throw new WorkflowError(
          'WORKFLOW_SUBJECT_NOT_FOUND',
          inspection.brokenTasks.includes(taskId)
            ? `The Task "${taskId}" is broken; restore its files from Git.`
            : `The Task "${taskId}" does not exist.`,
        );
      }

      const actions = await inspectActions(workflow, { kind: 'task', specId, taskId });
      emit(options, { task, actions }, [...taskDetailLines(task), ...actionLines(actions)]);
    });
  });

  describing(
    common(
      tasks
        .command('create')
        .description('Create a draft Task (approve it with "tasks status ... approve")')
        .argument('<spec-id>', 'Specification UUID')
        .requiredOption('--id <task-id>', 'Task id: lowercase letters, digits and dashes')
        .requiredOption('--title <title>', 'Title')
        .requiredOption('--type <task-type>', 'Task type id (immutable; see "definitions list")')
        .option(
          '--depends-on <task-id>',
          'A Task this one waits for (repeatable)',
          collect,
          [] as string[],
        )
        .option('--content-file <path>', 'The first text of task.md, read from this file')
        .option('--stdin', 'The first text of task.md, read from standard input'),
    ),
  ).action(
    async (
      specId: string,
      options: DescribeOptions & {
        id: string;
        title: string;
        type: string;
        contentFile?: string;
        stdin?: boolean;
      },
      command: Command,
    ) => {
      if (options.contentFile !== undefined && options.stdin) {
        command.error('Give at most one of --content-file and --stdin.');
      }

      await run(options, async ({ workflow }) => {
        const entries = await contextOf(context.cwd, options);
        const document =
          options.contentFile !== undefined || options.stdin
            ? await readContentInput(options, context)
            : undefined;
        const result = await createTask(workflow, {
          specId,
          taskId: options.id,
          title: options.title,
          type: options.type,
          ...(options.summary !== undefined ? { summary: options.summary } : {}),
          ...(options.dependsOn?.length ? { dependsOn: options.dependsOn } : {}),
          ...(entries !== undefined ? { context: entries } : {}),
          ...(document !== undefined ? { document } : {}),
          actor: owner(),
        });
        emit(options, result, resourceLines('Created', result));
      });
    },
  );

  describing(
    common(
      tasks
        .command('edit')
        .description(
          'Change a Task title, summary, dependencies (before its first start) or context',
        )
        .argument('<spec-id>', 'Specification UUID')
        .argument('<task-id>', 'Task id')
        .requiredOption(
          '--expected-revision <revision>',
          'The revision "tasks list|inspect" showed; a stale one is refused',
        )
        .option('--title <title>', 'New title')
        .option('--clear-summary', 'Remove the summary')
        .option(
          '--depends-on <task-id>',
          'The complete list of dependencies (repeatable)',
          collect,
          [] as string[],
        )
        .option('--no-dependencies', 'Remove every dependency')
        .option('--default-context', 'Restore the default context'),
    ),
  ).action(
    async (
      specId: string,
      taskId: string,
      options: DescribeOptions & {
        expectedRevision: string;
        title?: string;
        clearSummary?: boolean;
        dependencies?: boolean;
        defaultContext?: boolean;
      },
      command: Command,
    ) => {
      const contextGiven = (options.context?.length ?? 0) > 0 || options.contextFile !== undefined;
      if (options.summary !== undefined && options.clearSummary) {
        command.error('Give at most one of --summary and --clear-summary.');
      }

      if (options.defaultContext && contextGiven) {
        command.error('Give at most one of --default-context and --context/--context-file.');
      }

      if (options.dependencies === false && (options.dependsOn?.length ?? 0) > 0) {
        command.error('Give at most one of --depends-on and --no-dependencies.');
      }

      await run(options, async ({ workflow }) => {
        const entries = await contextOf(context.cwd, options);
        const result = await editTask(
          workflow,
          editTaskInput({ specId, taskId, options, context: entries, actor: owner() }),
        );
        emit(options, result, resourceLines('Edited', result));
      });
    },
  );

  common(
    tasks
      .command('remove')
      .description('Remove a Task that never started (a started Task is cancelled instead)')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<task-id>', 'Task id')
      .requiredOption('--expected-revision <revision>', 'The revision "tasks list|inspect" showed'),
  ).action(
    async (
      specId: string,
      taskId: string,
      options: CommonOptions & { expectedRevision: string },
    ) => {
      await run(options, async ({ workflow }) => {
        const result = await removeTask(workflow, {
          specId,
          taskId,
          expectedRevision: options.expectedRevision,
          actor: owner(),
        });
        emit(options, result, [`Removed: Task ${taskId}`]);
      });
    },
  );

  common(
    tasks
      .command('status')
      .description('Decide the status of a Task: approve a draft, hold, resume or cancel')
      .argument('<spec-id>', 'Specification UUID')
      .argument('<task-id>', 'Task id')
      .argument('<decision>', 'approve | hold | resume | cancel', (value: string) => {
        if (!Object.hasOwn(STATUS_VERBS, value)) {
          throw new InvalidArgumentError('Must be approve, hold, resume or cancel.');
        }

        return value;
      })
      .option('--reason <text>', 'Why (shown with the Task)'),
  ).action(
    async (
      specId: string,
      taskId: string,
      decision: string,
      options: CommonOptions & { reason?: string },
    ) => {
      await run(options, async ({ workflow }) => {
        const result = await setTaskStatus(workflow, {
          specId,
          taskId,
          status: STATUS_VERBS[decision]!,
          ...(options.reason !== undefined ? { reason: options.reason } : {}),
          actor: owner(),
        });
        emit(options, result, [`Task ${taskId}: ${result.status}`]);
      });
    },
  );

  return tasks;
}
