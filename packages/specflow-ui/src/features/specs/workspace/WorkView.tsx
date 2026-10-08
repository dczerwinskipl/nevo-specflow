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
import { TasksSection } from './tasks';

export interface WorkViewProps {
  readonly data: SpecificationWorkspaceData;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 */
export function WorkView({ data }: WorkViewProps) {
  return (
    <div className="grid max-w-content-standard gap-8 py-2">
      <SpecificationSummarySection
        title={data.title}
        intro={data.intro}
        isEmpty={data.isEmpty}
        mainDocumentId={data.mainDocumentId}
      />

      {data.attentionItems.length > 0 ? <AttentionSection items={data.attentionItems} /> : null}

      {data.hasGit && data.repoContext ? (
        <RepositorySection repoContext={data.repoContext} />
      ) : null}

      {!data.isEmpty && data.resumeSession ? (
        <ResumeSessionSection session={data.resumeSession} />
      ) : null}

      {data.isEmpty ? <PreparationSection /> : null}

      {!data.isEmpty ? (
        <TasksSection
          taskGroups={data.taskGroups}
          isPreparing={data.isPreparing}
          totalTasksCount={data.totalTasksCount}
          completedTasksCount={data.completedTasksCount}
          executionReadiness={data.executionReadiness}
        />
      ) : null}

      {!data.isEmpty ? <DocumentsSummarySection documents={data.documents} /> : null}

      {data.hasExtensions ? <ExtensionsSection /> : null}
    </div>
  );
}
