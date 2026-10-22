import type { ReactNode } from 'react';

import { defineUiExtensionPoint, type UiContribution } from '../../../app/ui-modules/contracts';
import type { RuntimeMode } from '../../../app/useRuntimeMode';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import type { SpecsCollection } from '../overview/model';

/** What a panel above the specification list may depend on. */
export interface SpecsOverviewPanelContext {
  readonly collection: SpecsCollection;
  /** How the Runtime serves data; panels wait for `project` or `demo`. */
  readonly mode: RuntimeMode;
  readonly operationsApi: OperationsApi;
}

/**
 * A panel the specification list shows above its table (for example the background operations of
 * Create). The contributing feature owns what it reads and draws; `render` returns nothing when the
 * panel has nothing to say for this collection.
 */
export interface SpecsOverviewPanelContribution extends UiContribution {
  readonly render: (context: SpecsOverviewPanelContext) => ReactNode;
}

export const specsOverviewPanels =
  defineUiExtensionPoint<SpecsOverviewPanelContribution>('specs.overview.panels');
