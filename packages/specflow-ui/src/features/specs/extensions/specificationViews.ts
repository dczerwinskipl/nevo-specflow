import type { ComponentType, ReactNode } from 'react';
import { defineUiExtensionPoint, type UiContribution } from '../../../app/ui-modules/contracts';
import type { UiRegistry } from '../../../app/ui-modules/registry';
import type {
  DocumentItem,
  SpecificationWorkspaceData,
  SpecificationWorkspaceView,
} from '../workspace/model';
import type { WorkspaceRuntime } from '../workspace/WorkspaceContext';

export type SpecificationContextView = Exclude<SpecificationWorkspaceView, 'work'>;

/** Temporary Specs-owned adapter for the aggregate Workspace response and local view state. */
export interface SpecificationViewContext {
  readonly data: SpecificationWorkspaceData;
  readonly actions: WorkspaceRuntime;
  readonly document: {
    readonly selectedId: string | null;
    readonly origin: 'work' | 'documents';
    readonly onSelect: (id: string | null) => void;
    readonly onBack: () => void;
    readonly renderContent?: (document: DocumentItem) => ReactNode;
  };
  readonly changes: {
    readonly source: 'base' | 'uncommitted' | 'mr';
    readonly onSourceChange: (source: 'base' | 'uncommitted' | 'mr') => void;
    readonly onDiff?: (file: string) => void;
  };
}

export interface SpecificationViewContribution extends UiContribution {
  readonly view: SpecificationContextView;
  readonly Component: ComponentType<SpecificationViewContext>;
}

export const specificationViews =
  defineUiExtensionPoint<SpecificationViewContribution>('specification.views');

/** Host-owned uniqueness rule, checked when the application composes its modules. */
export function assertUniqueSpecificationViews(registry: UiRegistry): void {
  const owners = new Map<SpecificationContextView, string>();
  for (const contribution of registry.get(specificationViews)) {
    const existing = owners.get(contribution.view);
    if (existing) {
      throw new Error(
        `Duplicate Specification view "${contribution.view}": ${existing} and ${contribution.id}`,
      );
    }
    owners.set(contribution.view, contribution.id);
  }
}
