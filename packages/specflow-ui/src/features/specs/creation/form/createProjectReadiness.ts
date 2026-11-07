import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../../i18n/message';
import type { WorkspaceOptionsState } from '../workspace/model/workspaceChoice';
import { workspaceProblems } from '../workspace/model/workspaceValidation';
import { type WorkspaceChoice } from '../workspace/model/workspaceChoice';
import type { CreateProblemField } from './createGuide';

/** Limits of the Runtime Create request (the contracts `CreateSpecRequestSchema`). */
export const createTitleMaxLength = 200;
export const createGoalMaxLength = 4000;

export interface ProjectCreateReadiness {
  /** Why Create is not available yet (first blocking reason), else undefined. */
  prerequisite: Message | undefined;
  /**
   * The field that reason belongs to, in the form's order (name, archetype, then the workspace
   * fields); absent when no field can fix it (loading, no permission, nothing installed).
   */
  problemField?: CreateProblemField;
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
  /** The catalogue was read and the project has no archetype installed. */
  noArchetypes?: boolean;
}): ProjectCreateReadiness {
  const { title, goal, workspaceState, choice } = input;
  const tooLong =
    title.trim().length > createTitleMaxLength || goal.trim().length > createGoalMaxLength;
  const blocked = (
    prerequisite: Message,
    problemField?: CreateProblemField,
  ): ProjectCreateReadiness => ({
    prerequisite,
    ...(problemField ? { problemField } : {}),
    canSubmit: false,
  });

  if (input.forbidden) {
    return blocked(message('create.prerequisite.forbidden'));
  }

  if (!title.trim()) {
    return blocked(message('create.prerequisite.title'), 'name');
  }

  if (input.archetypesLoading) {
    return blocked(message('create.archetype.loading'));
  }

  if (input.noArchetypes) {
    return blocked(message('create.prerequisite.noArchetypes'));
  }

  if (!input.archetype) {
    return blocked(message('create.prerequisite.archetype'), 'archetype');
  }

  switch (workspaceState.status) {
    case 'loading':
      return blocked(message('create.prerequisite.workspaceLoading'));
    case 'error':
      return blocked(message('create.prerequisite.workspaceError'));
    case 'forbidden':
      return blocked(message('create.prerequisite.forbidden'));
    case 'ready':
      break;
  }

  const [workspaceProblem] = workspaceProblems(choice, workspaceState.options, title);
  if (workspaceProblem) {
    return blocked(workspaceProblem.message, workspaceProblem.field);
  }

  return { prerequisite: undefined, canSubmit: !tooLong };
}
