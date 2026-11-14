import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import {
  specificationAttentionItems,
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs';
import { RepositorySection } from './contributions/specification-work/RepositorySection';
import { message } from '../../i18n/message';

function SpecificationRepository({ data, actions }: SpecificationWorkSectionContext) {
  if (!data.repoContext) {
    return null;
  }

  return (
    <RepositorySection
      repoContext={data.repoContext}
      onOpenChanges={actions.openChanges}
      onRefresh={actions.refresh}
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
    contributeTo(specificationAttentionItems, {
      id: 'specflow.git.attention',
      getItems: ({ data, actions }) => {
        const source = data.featureAttention?.git;
        if (!source || (source.state === 'unavailable' && source.reason === 'source_unavailable')) {
          return { state: 'unavailable' };
        }

        if (source.state !== 'available') {
          return { state: 'excluded' };
        }

        return source.items.map((item) => ({
          item,
          icon: 'branch',
          action: {
            label:
              item.actionCode === 'git'
                ? message('specification.viewRepository')
                : item.actionLabel,
            onClick: actions.openRepository,
          },
        }));
      },
    }),
  ],
};
