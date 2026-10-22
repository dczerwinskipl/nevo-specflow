import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../i18n/message';
import type { WorkspaceOptionsState } from './workspace/WorkspacePlaceSection';
import { problems as workspaceProblems } from './workspace/workspaceValidation';
import { type WorkspaceChoice } from './workspace/workspaceChoice';

/** Limits of the Runtime Create request (the contracts `CreateSpecRequestSchema`). */
export const createTitleMaxLength = 200;
export const createGoalMaxLength = 4000;

export interface ProjectCreateReadiness {
  /** Why Create is not available yet (first blocking reason), else undefined. */
  prerequisite: Message | undefined;
  canSubmit: boolean;
}

/** Whether the project Create form can be submitted and, if not, the one reason shown in the footer. */
export function projectCreateReadiness(input: {
  title: string;
  goal: string;
  workspaceState: WorkspaceOptionsState;
  choice: WorkspaceChoice;
  forbidden: boolean;
}): ProjectCreateReadiness {
  const { title, goal, workspaceState, choice } = input;
  const workspaceProblem: Message | undefined =
    workspaceState.status === 'loading'
      ? message('create.prerequisite.workspaceLoading')
      : workspaceState.status === 'error'
        ? message('create.prerequisite.workspaceError')
        : workspaceState.status === 'forbidden'
          ? message('create.prerequisite.forbidden')
          : workspaceProblems(choice, workspaceState.options satisfies CreateOptions)[0];
  const tooLong =
    title.trim().length > createTitleMaxLength || goal.trim().length > createGoalMaxLength;
  const prerequisite = input.forbidden
    ? message('create.prerequisite.forbidden')
    : !title.trim()
      ? message('create.prerequisite.title')
      : workspaceProblem;
  return { prerequisite, canSubmit: !prerequisite && !tooLong };
}
