import { specificationUiModules } from '../../../app/ui-modules/builtInUiModules';
import type { UiModuleRegistry } from '../../../app/ui-modules/registry';
import { SpecificationWorkSectionOutlet } from './SpecificationWorkSectionOutlet';
import type { SpecificationWorkspaceData } from './model';
import {
  SpecificationSummarySection,
  AttentionSection,
  RepositorySection,
  ResumeSessionSection,
  PreparationSection,
  DocumentsSummarySection,
} from './sections';

export interface WorkViewProps {
  readonly specId?: string;
  readonly data: SpecificationWorkspaceData;
  /** Host composition seam for registered features, including tests and future plugins. */
  readonly modules?: UiModuleRegistry;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 */
export function WorkView({ specId, data, modules = specificationUiModules }: WorkViewProps) {
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

      <SpecificationWorkSectionOutlet
        slot="main"
        specId={specId ?? data.id}
        data={data}
        modules={modules}
      />

      {!data.isEmpty &&
      (!data.sectionAvailability?.documents ||
        data.sectionAvailability.documents === 'available') ? (
        <div className="py-6">
          <DocumentsSummarySection documents={data.documents} />
        </div>
      ) : null}

      <SpecificationWorkSectionOutlet
        slot="related"
        specId={specId ?? data.id}
        data={data}
        modules={modules}
      />
    </div>
  );
}
