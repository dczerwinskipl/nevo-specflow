import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import { specificationAttentionItems, specificationWorkSections } from '../specs';
import { taskAttentionEntry } from './contributions/specification-overview/attentionEntries';
import {
  TasksSummarySection,
  tasksSummaryVisible,
} from './contributions/specification-overview/TasksSummarySection';

export const tasksUiModule: UiModule = {
  id: 'specflow.tasks',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.tasks.summary',
      slot: 'main',
      // Omitted without Tasks: the Tasks page (navigator) holds New task and the empty state.
      isVisible: tasksSummaryVisible,
      Component: TasksSummarySection,
    }),
    contributeTo(specificationAttentionItems, {
      id: 'specflow.tasks.attention',
      getItems: ({ specId, data, actions }) => {
        const source = data.featureAttention?.tasks;
        if (!source || (source.state === 'unavailable' && source.reason === 'source_unavailable')) {
          return { state: 'unavailable' };
        }

        if (source.state !== 'available') {
          return { state: 'excluded' };
        }

        return source.items.map((item) => taskAttentionEntry(item, { specId, data, actions }));
      },
    }),
  ],
};
