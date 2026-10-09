import { describe, expect, it } from 'vitest';
import { appI18n } from '../../../i18n';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { mapWorkspaceResponse } from './mapWorkspaceResponse';
import { taskStatusLabel } from './status-labels';

describe('Workspace response mapping', () => {
  it('stores semantic statuses independently of locale and translates on rendering', async () => {
    const dto = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
    const mapped = mapWorkspaceResponse(dto);
    const task = mapped.taskGroups[0]?.tasks[0];
    if (!task) throw new Error('Expected integration task');
    expect(task.statusCode).toBe('in_progress');

    await appI18n.changeLanguage('en');
    expect(taskStatusLabel(task, appI18n.t)).toBe('In progress');
    await appI18n.changeLanguage('pl');
    expect(taskStatusLabel(task, appI18n.t)).toBe('W trakcie');
    // Locale changes must not mutate a cached presentation projection.
    expect(mapped.taskGroups[0]?.tasks[0]).toBe(task);
    expect(mapped.id).toBe('api-integration');
  });
  it('keeps backend execution unavailability reason as a semantic code', async () => {
    const dto = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
    const mapped = mapWorkspaceResponse(dto);
    expect(mapped.executionReadiness).toEqual({
      canExecute: false,
      reasonCode: 'not_implemented',
      blockers: [],
    });
  });
});
