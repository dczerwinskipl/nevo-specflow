import {
  finishStep,
  inspectActions,
  resolveSpecification,
  returnToStep,
  startSpecificationExecution,
  startTaskExecution,
  type FinishStepInput,
  type TaskDecision,
  type TaskProposal,
  WorkflowError,
  type WorkflowSubject,
} from '@nevo/specflow-engine';
import { Command } from 'commander';

import {
  openExecution,
  reportingWorkflowRefusals,
  type ExecutionOutput,
  type ExecutionSession,
} from '../execution-session';
import { localOwner } from '../local-actor';
import { parsePositiveInt, readStructuredFile } from '../structured-input';
import { actionLines, finishLines, returnLines, startLines } from './present';

export interface WorkflowCommandContext extends ExecutionOutput {
  readonly cwd: string;
  /** The OS user behind the owner actor; the installed user unless a test supplies one. */
  readonly osUser?: string;
}

interface CommonOptions {
  readonly task?: string;
  readonly projectRoot?: string;
  readonly json?: boolean;
}

/**
 * `nevo-specflow workflow ...`: the manual execution of a Specification or a Task, offline, through
 * the same Engine use cases as the Runtime. `<spec-id>` alone names the Specification's own run;
 * `--task <task-id>` names the run of one of its Tasks.
 *
 * The actor is always the local owner (`local:<os-user>`, `trust: local`, class `human`), built by
 * the CLI: there is no option for an actor or an executor class, and `trust: local` is not proof
 * of a human. Exit codes: 0 success; 1 a refusal (`CODE: message` on stderr) or another failure;
 * 2 a usage error.
 */
export function createWorkflowCommand(context: WorkflowCommandContext): Command {
  const owner = () => localOwner(context.osUser);
  const workflow = new Command('workflow').description(
    'Inspect and drive the manual execution of a Specification or Task (offline, through the Engine)',
  );

  const common = (command: Command): Command =>
    command
      .argument('<spec-id>', 'Specification UUID')
      .option(
        '--task <task-id>',
        'Act on this Task of the Specification instead of the Specification',
      )
      .option('--project-root <path>', 'Require this verified Project Home root')
      .option('--json', 'Print the result as JSON');

  const subjectOf = (specId: string, options: CommonOptions): WorkflowSubject =>
    options.task === undefined
      ? { kind: 'specification', specId }
      : { kind: 'task', specId, taskId: options.task };

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
    workflow
      .command('actions')
      .description('Show where the run stands and the actions the owner may take now (read-only)'),
  ).action(async (specId: string, options: CommonOptions) => {
    await run(options, async ({ workflow: dependencies }) => {
      const projection = await inspectActions(dependencies, subjectOf(specId, options));
      emit(options, projection, actionLines(projection));
    });
  });

  common(
    workflow
      .command('start')
      .description(
        'Start (or resume) the next step as the owner; the first start pins the workflow',
      )
      .option(
        '--expected-workflow-revision <revision>',
        'Task first start: the workflow revision shown by "workflow actions"; a different one is refused',
      ),
  ).action(
    async (
      specId: string,
      options: CommonOptions & { expectedWorkflowRevision?: string },
      command: Command,
    ) => {
      if (options.task === undefined && options.expectedWorkflowRevision !== undefined) {
        command.error('--expected-workflow-revision applies to a Task start (--task).');
      }

      await run(options, async ({ engine, workflow: dependencies }) => {
        const actor = owner();
        const result =
          options.task !== undefined
            ? await startTaskExecution(dependencies, {
                specId,
                taskId: options.task,
                actor,
                ...(options.expectedWorkflowRevision !== undefined
                  ? { expectedWorkflowRevision: options.expectedWorkflowRevision }
                  : {}),
              })
            : await startSpecificationExecution(dependencies, {
                specId,
                archetype: await archetypeOf(engine, specId),
                actor,
              });
        emit(options, result, startLines(result));
      });
    },
  );

  common(
    workflow
      .command('finish')
      .description('Finish the active attempt of the owner with a result and what it hands over')
      .requiredOption('--step <step-id>', 'The step you worked on')
      .requiredOption(
        '--attempt <number>',
        'The attempt you worked on (see "workflow actions"); a stale one is refused',
        parsePositiveInt,
      )
      .option('--result <result>', 'The result the step finishes with (see "workflow actions")')
      .option('--feedback <text>', 'Feedback handed to the next step; required by some transitions')
      .option('--artifact <ref>', 'An artifact to hand over (repeatable)', collect, [] as string[])
      .option(
        '--tasks-file <path>',
        'A step that produces Tasks: YAML/JSON list of the complete draft Tasks',
      )
      .option(
        '--task-decisions-file <path>',
        'A Specification step: YAML/JSON list of Task status decisions',
      ),
  ).action(
    async (
      specId: string,
      options: CommonOptions & {
        step: string;
        attempt: number;
        result?: string;
        feedback?: string;
        artifact: string[];
        tasksFile?: string;
        taskDecisionsFile?: string;
      },
    ) => {
      await run(options, async ({ workflow: dependencies }) => {
        const input: FinishStepInput['input'] = {
          ...(options.result !== undefined ? { result: options.result } : {}),
          ...(options.feedback !== undefined ? { feedback: options.feedback } : {}),
          ...(options.artifact.length > 0 ? { artifacts: options.artifact } : {}),
          ...(options.tasksFile !== undefined
            ? {
                tasks: (await readStructuredFile(
                  context.cwd,
                  options.tasksFile,
                  'tasks',
                )) as TaskProposal[],
              }
            : {}),
          ...(options.taskDecisionsFile !== undefined
            ? {
                taskDecisions: (await readStructuredFile(
                  context.cwd,
                  options.taskDecisionsFile,
                  'Task decisions',
                )) as TaskDecision[],
              }
            : {}),
        };
        const result = await finishStep(dependencies, {
          subject: subjectOf(specId, options),
          step: options.step,
          attempt: options.attempt,
          input,
          actor: owner(),
        });
        emit(options, result, finishLines(result));
      });
    },
  );

  common(
    workflow
      .command('return')
      .description('Send the run back to an earlier step it already reached ("back to the table")')
      .requiredOption('--step <step-id>', 'The declared return target (see "workflow actions")')
      .option('--reason <text>', 'Why; handed to the step as feedback, required by some returns'),
  ).action(async (specId: string, options: CommonOptions & { step: string; reason?: string }) => {
    await run(options, async ({ workflow: dependencies }) => {
      const result = await returnToStep(dependencies, {
        subject: subjectOf(specId, options),
        step: options.step,
        ...(options.reason !== undefined ? { feedback: options.reason } : {}),
        actor: owner(),
      });
      emit(options, result, returnLines(result));
    });
  });

  return workflow;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** The archetype whose execution binding starts the Specification run. */
async function archetypeOf(
  engine: Parameters<typeof resolveSpecification>[0],
  specId: string,
): Promise<string> {
  const found = await resolveSpecification(engine, specId);
  if (found.status !== 'available') {
    throw new WorkflowError(
      'WORKFLOW_SUBJECT_NOT_FOUND',
      `The Specification "${specId}" is not available in a registered checkout (${found.status}).`,
    );
  }

  return found.specification.archetype.id;
}
