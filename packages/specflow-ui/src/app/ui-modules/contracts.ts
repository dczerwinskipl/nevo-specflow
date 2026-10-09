import type { ReactNode } from 'react';
import type { SpecificationWorkspaceData } from '../../features/specs/workspace/model';
import type { WorkspaceRuntime } from '../../features/specs/workspace/WorkspaceContext';

/** Registered UI modules own features; hosts own where their contributions appear. */
export interface SpecFlowUiModule {
  readonly id: string;
  readonly contributions: readonly SpecificationWorkSectionContribution[];
}

/** A transitional, Specification-owned adapter. It is not a generic plugin context. */
export interface SpecificationWorkSectionContext {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly actions: WorkspaceRuntime;
}

export interface SpecificationWorkSectionContribution {
  readonly extensionPoint: 'specification.work.sections';
  readonly id: string;
  readonly slot: 'main' | 'related';
  readonly isVisible?: (context: SpecificationWorkSectionContext) => boolean;
  readonly render: (context: SpecificationWorkSectionContext) => ReactNode;
}

export type SpecificationWorkSlot = SpecificationWorkSectionContribution['slot'];
