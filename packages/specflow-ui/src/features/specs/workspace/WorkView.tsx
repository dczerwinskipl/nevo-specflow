import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useWorkspaceRuntime } from './WorkspaceContext';
import type { SpecificationWorkspaceData } from './model';
import {
  SpecificationSummarySection,
  AttentionSection,
  RepositorySection,
  ResumeSessionSection,
  PreparationSection,
  DocumentsSummarySection,
  ExtensionsSection,
} from './sections';
import { TasksSection } from '../../tasks/contributions/specification-work';

export interface WorkViewProps {
  readonly specId?: string;
  readonly data: SpecificationWorkspaceData;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 */
export function WorkView({ specId, data }: WorkViewProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();
  return (
    <div className="divide-y divide-border-subtle max-w-content-standard">
      <div className="pb-6">
        <SpecificationSummarySection
          title={data.title}
          intro={data.intro}
          isEmpty={data.isEmpty}
          mainDocumentId={data.mainDocumentId}
        />
      </div>

      {data.attentionItems.length > 0 ? (
        <div className="py-6">
          <AttentionSection items={data.attentionItems} />
        </div>
      ) : null}

      {data.hasGit && data.repoContext ? (
        <div className="py-6">
          <RepositorySection repoContext={data.repoContext} />
        </div>
      ) : null}

      {!data.isEmpty && data.resumeSession ? (
        <div className="py-6">
          <ResumeSessionSection session={data.resumeSession} />
        </div>
      ) : null}

      {data.isEmpty ? (
        <div className="py-6">
          <PreparationSection />
        </div>
      ) : null}

      {!data.isEmpty &&
      data.sectionAvailability?.tasks !== 'unavailable' &&
      data.sectionAvailability?.tasks !== 'forbidden' ? (
        <div className="py-6">
          <TasksSection
            key={specId}
            taskGroups={data.taskGroups}
            isPreparing={data.isPreparing}
            totalTasksCount={data.totalTasksCount}
            completedTasksCount={data.completedTasksCount}
            executionReadiness={data.executionReadiness}
            onPreviewTask={runtime.previewTask}
            fullTaskHref={runtime.fullTaskHref}
            onExecuteTasks={runtime.executeTasks}
            canExecute={runtime.canExecute !== false}
          />
        </div>
      ) : null}

      {data.sectionAvailability?.tasks && data.sectionAvailability.tasks !== 'available' ? (
        <div className="py-6">
          <Alert tone="attention" title={t('specification.unavailableTitle')}>
            {t('specification.unavailableDescription', { id: specId ?? data.id })}
          </Alert>
        </div>
      ) : null}

      {!data.isEmpty &&
      (!data.sectionAvailability?.documents ||
        data.sectionAvailability.documents === 'available') ? (
        <div className="py-6">
          <DocumentsSummarySection documents={data.documents} />
        </div>
      ) : null}

      {data.hasExtensions ? (
        <div className="py-6">
          <ExtensionsSection />
        </div>
      ) : null}
    </div>
  );
}
