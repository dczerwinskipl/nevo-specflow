import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowAppServices, SpecFlowServicesProvider } from '../../../services';
import { specificationKeys } from '../queries';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import {
  SpecificationSecondaryDataContext,
  useTaskPreviewData,
} from './specificationSecondaryStack';

const specId = 'admission';
const taskId = 'TASK-77';

function PreviewStatus() {
  const preview = useTaskPreviewData({ specId, taskId });
  return <span>{preview.status === 'ready' ? preview.data.task.title : preview.status}</span>;
}

describe('Task preview by identity', () => {
  it('uses the Task detail API/cache when a Task is missing from Workspace groups', () => {
    const queryClient = createSpecFlowQueryClient();
    queryClient.setQueryData(specificationKeys.task(specId, taskId), {
      task: {
        id: taskId,
        title: 'Referenced outside Task list',
        status: { id: 'pending', label: 'Pending', lifecycle: 'pending' },
      },
      acceptanceCriteria: [],
    });
    const data = { ...createSpecificationWorkspaceFixture('working', specId), taskGroups: [] };
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpecFlowServicesProvider services={createSpecFlowAppServices()}>
          <SpecificationSecondaryDataContext.Provider
            value={{
              specId,
              data,
              openFullTask: () => undefined,
              previewTask: () => undefined,
            }}
          >
            <PreviewStatus />
          </SpecificationSecondaryDataContext.Provider>
        </SpecFlowServicesProvider>
      </QueryClientProvider>,
    );
    expect(markup).toContain('Referenced outside Task list');
    expect(markup).not.toContain('unavailable');
  });
});
