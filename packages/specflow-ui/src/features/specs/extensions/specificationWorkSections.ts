import type { ComponentType } from 'react';
import { defineUiExtensionPoint, type UiContribution } from '../../../app/ui-modules/contracts';
import type { SpecificationWorkspaceData } from '../read-model/model';
import type { WorkspaceRuntime } from '../workspace/WorkspaceContext';

/** Host-specific context. This aggregate Workspace adapter is transitional, not a plugin API. */
export interface SpecificationWorkSectionContext {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly actions: WorkspaceRuntime;
  /**
   * The preparation block shows in Now's place (no workflow, no Tasks, no Session) and owns the
   * start of a Session there: a section does not offer the same start again.
   */
  readonly preparationShown?: boolean;
}

/**
 * Where a section sits on Specification Overview:
 * - `resume`: the entry back into work (Continue session), first among the context sections;
 * - `context`: other context about the Specification (repository);
 * - `main`: the work itself (Tasks);
 * - `related`: related material (Documents).
 *
 * One column reads `resume`, `context`, preparation, `main`, `related`. Two columns put `main` in
 * the work column and `resume`, `related`, `context` in the context column, in that order.
 */
export interface SpecificationWorkSectionContribution extends UiContribution {
  readonly slot: 'resume' | 'context' | 'main' | 'related';
  readonly isVisible?: (context: SpecificationWorkSectionContext) => boolean;
  readonly Component: ComponentType<SpecificationWorkSectionContext>;
}

export type SpecificationWorkSlot = SpecificationWorkSectionContribution['slot'];

export const specificationWorkSections =
  defineUiExtensionPoint<SpecificationWorkSectionContribution>('specification.work.sections');
