import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import {
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs/extensions/specificationWorkSections';
import { RepositorySection } from './contributions/specification-work/RepositorySection';
import {
  specificationViews,
  type SpecificationViewContext,
} from '../specs/extensions/specificationViews';
import { RepositoryView } from './views/RepositoryView';
import { ChangesView } from './views/ChangesView';
import { specificationAttentionItems } from '../specs/extensions/specificationAttentionItems';

function SpecificationRepository({ data, actions }: SpecificationWorkSectionContext) {
  if (!data.repoContext) return null;
  return (
    <RepositorySection
      repoContext={data.repoContext}
      onOpenChanges={actions.openChanges}
      onRefresh={actions.refresh}
    />
  );
}

function SpecificationRepositoryView({ data, actions }: SpecificationViewContext) {
  return (
    <RepositoryView
      repoContext={data.repoContext}
      onGoToChanges={() => actions.openChanges('base')}
    />
  );
}

function SpecificationChangesView({ data, changes }: SpecificationViewContext) {
  return (
    <ChangesView
      changes={data.changes}
      currentSource={changes.source}
      onSourceChange={changes.onSourceChange}
      onDiff={changes.onDiff}
    />
  );
}

export const gitUiModule: UiModule = {
  id: 'specflow.git',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.git.repository',
      slot: 'context',
      isVisible: ({ data }) => Boolean(data.hasGit && data.repoContext),
      Component: SpecificationRepository,
    }),
    contributeTo(specificationViews, {
      id: 'specflow.git.repository-view',
      view: 'repository',
      Component: SpecificationRepositoryView,
    }),
    contributeTo(specificationViews, {
      id: 'specflow.git.changes-view',
      view: 'changes',
      Component: SpecificationChangesView,
    }),
    contributeTo(specificationAttentionItems, {
      id: 'specflow.git.attention',
      getItems: ({ data, actions }) =>
        data.attentionItems
          .filter((item) => item.kind === 'git')
          .map((item) => ({
            item,
            icon: 'branch',
            action: {
              label: item.actionLabel,
              labelKey: item.actionCode === 'git' ? 'specification.viewRepository' : undefined,
              onClick: actions.openRepository,
            },
          })),
    }),
  ],
};
