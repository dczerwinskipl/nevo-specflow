import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../i18n/message';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';
import { problems as workspaceProblems } from '../workspace/model/workspaceValidation';
import { type WorkspaceChoice } from '../workspace/model/workspaceChoice';

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
  /** The archetype catalogue is still loading. */
  archetypesLoading: boolean;
  /** The selected archetype (undefined while loading, after a failure or with an empty catalogue). */
  archetype: ArchetypeInfo | undefined;
}): ProjectCreateReadiness {
  const { title, goal, workspaceState, choice } = input;
  const workspaceProblem: Message | undefined =
    workspaceState.status === 'loading'
      ? message('create.prerequisite.workspaceLoading')
      : workspaceState.status === 'error'
        ? message('create.prerequisite.workspaceError')
        : workspaceState.status === 'forbidden'
          ? message('create.prerequisite.forbidden')
          : workspaceProblems(choice, workspaceState.options satisfies CreateOptions, title)[0];
  const tooLong =
    title.trim().length > createTitleMaxLength || goal.trim().length > createGoalMaxLength;
  const prerequisite = input.forbidden
    ? message('create.prerequisite.forbidden')
    : !title.trim()
      ? message('create.prerequisite.title')
      : input.archetypesLoading
        ? message('create.archetype.loading')
        : !input.archetype
          ? message('create.prerequisite.archetype')
          : workspaceProblem;
  return { prerequisite, canSubmit: !prerequisite && !tooLong };
}
