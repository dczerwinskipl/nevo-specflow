import { createElement } from 'react';

import { contributeTo, type UiModule } from '../../../app/ui-modules/contracts';
import { specsOverviewPanels } from '../extensions/specsOverviewPanels';
import { CreateOperationsPanel } from './operations-panel/CreateOperationsPanel';

/**
 * Specification creation contributes the panel of its running operations to the specification list
 * (current collection only: a Create produces a current specification).
 */
export const creationUiModule: UiModule = {
  id: 'specflow.specifications.creation',
  contributions: [
    contributeTo(specsOverviewPanels, {
      id: 'specflow.specifications.creation.operations',
      render: ({ collection, mode, operationsApi }) =>
        collection === 'current'
          ? createElement(CreateOperationsPanel, { api: operationsApi, mode })
          : null,
    }),
  ],
};
