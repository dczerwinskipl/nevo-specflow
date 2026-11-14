import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import { specificationWorkSections, type SpecificationWorkSectionContext } from '../specs';
import { SpecificationDocsSection } from './contributions/specification-work/SpecificationDocsSection';

function SpecificationDocs({ data }: SpecificationWorkSectionContext) {
  return data.workspaceId ? <SpecificationDocsSection workspaceId={data.workspaceId} /> : null;
}

export const docsUiModule: UiModule = {
  id: 'specflow.docs',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.docs.workspace',
      // A compact row after the Specification's own work (Tasks, Documents), never above it: the
      // Overview has no workspace facts section it could join.
      slot: 'related',
      isVisible: ({ data }) => Boolean(data.workspaceId),
      Component: SpecificationDocs,
    }),
  ],
};
