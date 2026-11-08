import { describe, expect, it } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkSectionContext } from '../specs';
import type { SpecificationWorkspaceData } from '../specs/read-model';
import { tasksUiModule } from './uiModule';

const section = tasksUiModule.contributions.find(
  (registration) => registration.contribution.id === 'specflow.tasks.task-groups',
)!.contribution as {
  readonly isVisible?: (context: SpecificationWorkSectionContext) => boolean;
};

function visible(data: SpecificationWorkspaceData): boolean {
  // Visibility reads the data only.
  const context = { specId: data.id, data, actions: {} } as SpecificationWorkSectionContext;

  return section.isVisible?.(context) ?? true;
}

describe('Tasks work section visibility', () => {
  const empty = createSpecificationWorkspaceFixture('empty');

  it('shows an available section without Tasks, so its empty state and #tasks-heading render', () => {
    expect(visible({ ...empty, sectionAvailability: { tasks: 'available' } })).toBe(true);
  });

  it('shows an unavailable or forbidden section and any Specification with Tasks', () => {
    expect(visible({ ...empty, sectionAvailability: { tasks: 'unavailable' } })).toBe(true);
    expect(visible({ ...empty, sectionAvailability: { tasks: 'forbidden' } })).toBe(true);
    expect(visible(createSpecificationWorkspaceFixture('working'))).toBe(true);
  });

  it('hides an empty Specification whose Tasks availability is unknown', () => {
    expect(visible(empty)).toBe(false);
  });
});
