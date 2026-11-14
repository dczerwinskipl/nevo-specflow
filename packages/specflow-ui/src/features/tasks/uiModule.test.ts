import { describe, expect, it } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkSectionContext } from '../specs';
import type { SpecificationWorkspaceData } from '../specs/read-model';
import { tasksUiModule } from './uiModule';

const section = tasksUiModule.contributions.find(
  (registration) => registration.contribution.id === 'specflow.tasks.summary',
)!.contribution as {
  readonly isVisible?: (context: SpecificationWorkSectionContext) => boolean;
};

function visible(data: SpecificationWorkspaceData): boolean {
  // Visibility reads the data only.
  const context = { specId: data.id, data, actions: {} } as SpecificationWorkSectionContext;

  return section.isVisible?.(context) ?? true;
}

describe('Overview Tasks summary visibility', () => {
  const empty = createSpecificationWorkspaceFixture('empty');

  it('is omitted without Tasks: the Tasks page holds New task and the empty state', () => {
    expect(visible({ ...empty, sectionAvailability: { tasks: 'available' } })).toBe(false);
    expect(visible(empty)).toBe(false);
  });

  it('shows an unavailable or forbidden Tasks read and any Specification with Tasks', () => {
    expect(visible({ ...empty, sectionAvailability: { tasks: 'unavailable' } })).toBe(true);
    expect(visible({ ...empty, sectionAvailability: { tasks: 'forbidden' } })).toBe(true);
    expect(visible(createSpecificationWorkspaceFixture('working'))).toBe(true);
  });
});
