import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import {
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs/extensions/specificationWorkSections';
import { DocumentsSummarySection } from './contributions/specification-work/DocumentsSummarySection';
import {
  specificationViews,
  type SpecificationViewContext,
} from '../specs/extensions/specificationViews';
import { DocumentsView } from './views/DocumentsView';

function SpecificationDocuments({ data, actions }: SpecificationWorkSectionContext) {
  return (
    <DocumentsSummarySection
      documents={data.documents}
      onOpenDocument={actions.openDoc}
      onOpenDocumentsView={actions.openDocumentsView}
    />
  );
}

function SpecificationDocumentsView({ data, document }: SpecificationViewContext) {
  return (
    <DocumentsView
      documents={data.documents}
      renderContent={document.renderContent}
      activeDocId={document.selectedId}
      docOrigin={document.origin}
      onSelectDoc={document.onSelect}
      onBackToOrigin={document.onBack}
    />
  );
}

export const documentsUiModule: UiModule = {
  id: 'specflow.documents',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.documents.summary',
      slot: 'related',
      isVisible: ({ data }) =>
        !data.isEmpty &&
        (!data.sectionAvailability?.documents ||
          data.sectionAvailability.documents === 'available'),
      Component: SpecificationDocuments,
    }),
    contributeTo(specificationViews, {
      id: 'specflow.documents.view',
      view: 'documents',
      Component: SpecificationDocumentsView,
    }),
  ],
};
