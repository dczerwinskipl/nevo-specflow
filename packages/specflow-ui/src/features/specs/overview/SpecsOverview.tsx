import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  SegmentedControl,
  TextInput,
  Typography,
  useInitialAppearance,
} from '@nevo/ui';

import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { ViewPageTitle } from '../../../app/navigation/ApplicationLocation';
import type { SpecsCollection, SpecsOverviewState, CurrentSpecTarget } from './model';
import { SpecsOverviewCollection } from './SpecsOverviewCollection';
import { SpecsOverviewEmpty } from './SpecsOverviewEmpty';
import { SpecsOverviewHeader } from './SpecsOverviewHeader';
import { SpecsOverviewNotice } from './SpecsOverviewNotice';
import { overviewCapabilities } from './presentation';
import { filterSpecsOverview, isSearchable } from './search/search';
import { useCollectionSearch } from './search/useCollectionSearch';

export interface SpecsOverviewProps {
  readonly state: SpecsOverviewState;
  readonly onCollectionChange: (collection: SpecsCollection) => void;
  readonly onRefresh: () => void;
  readonly onOpenTarget?: (target: CurrentSpecTarget) => void;
  readonly onCreate?: () => void;
  /** Create is offered but cannot be used yet (for example the Runtime mode is still unknown). */
  readonly createDisabled?: boolean;
  readonly onCreateSession?: () => void;
  /**
   * Background operations above the list (the operations panel). The host builds it from API data
   * and decides which collections show it; it renders nothing while it has nothing to say.
   */
  readonly operationsPanel?: ReactNode;
  readonly sample?: boolean;
  readonly specificationHref?: (specId: string) => string;
  readonly renderSpecificationLink?: (
    specId: string,
    children: ReactNode,
    ariaLabel: string,
  ) => ReactNode;
}

export function SpecsOverview({
  state,
  onCollectionChange,
  onRefresh,
  onOpenTarget,
  onCreate,
  createDisabled = false,
  onCreateSession,
  operationsPanel,
  sample = false,
  specificationHref,
  renderSpecificationLink,
}: SpecsOverviewProps) {
  const { t } = useTranslation();
  const search = useCollectionSearch(state.collection);
  const projection =
    state.projection?.collection === state.collection ? state.projection : undefined;
  // Decided from the whole collection so that typing in the search does not change the layout.
  const capabilities = projection ? overviewCapabilities(projection) : undefined;
  const visible = projection ? filterSpecsOverview(projection, search.term) : undefined;
  const busy = state.loading || state.refreshing;
  const appearance = useInitialAppearance(state.collection, state.loading, Boolean(projection));

  return (
    <AppWorkspace
      labels={{
        backToPrimary: t('navigation.back'),
        closeSecondary: t('navigation.closeSecondary'),
        openNavigation: t('navigation.open'),
      }}
      split="primary"
      fit="bounded"
    >
      <AppWorkspace.Primary
        header={
          <SpecsOverviewHeader
            refreshing={state.refreshing}
            busy={busy}
            onCreate={onCreate}
            createDisabled={createDisabled}
            onCreateSession={onCreateSession}
            onRefresh={onRefresh}
          />
        }
      >
        <AppContent className="w-content-standard max-w-full">
          {/* A flex column down to the list, so an empty collection can centre in the free height. */}
          <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col py-6">
            <AppContentContainer align="start" className="flex flex-1 flex-col gap-4" size="full">
              <ViewPageTitle className="mb-2">{t('specifications.title')}</ViewPageTitle>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <SegmentedControl
                  aria-label={t('specifications.collection')}
                  value={state.collection}
                  onValueChange={(value) => onCollectionChange(value as SpecsCollection)}
                >
                  <SegmentedControl.Item value="current">
                    {t('specifications.current')}
                  </SegmentedControl.Item>
                  <SegmentedControl.Item value="archive">
                    {t('specifications.archive')}
                  </SegmentedControl.Item>
                </SegmentedControl>
                {sample ? (
                  <Typography className="text-content-muted" variant="body-sm">
                    {t('specifications.sample')}
                  </Typography>
                ) : null}
              </div>
              {sample && !specificationHref && !renderSpecificationLink ? (
                <Typography className="text-content-secondary" variant="body-sm">
                  {t('specifications.previewDescription')}
                </Typography>
              ) : null}
              {isSearchable(state.collection, search.term, projection) ? (
                <TextInput
                  aria-label={t('specifications.search')}
                  placeholder={t('specifications.search')}
                  value={search.term}
                  onChange={(event) => search.setTerm(event.target.value)}
                  className="w-full"
                />
              ) : null}
              {state.error ? (
                <SpecsOverviewNotice
                  hasRows={Boolean(projection)}
                  busy={busy}
                  onRetry={onRefresh}
                />
              ) : null}
              {operationsPanel}
              <div ref={appearance} className="flex min-w-0 flex-1 flex-col">
                {state.loading || state.paused ? (
                  <LoadingPresentation
                    shape="overview"
                    label={t('specifications.loading')}
                    fetching={!state.paused}
                  />
                ) : null}
                {visible && !state.loading ? (
                  <SpecsOverviewCollection
                    projection={visible}
                    capabilities={capabilities}
                    searching={search.term.trim().length > 0}
                    onOpenTarget={onOpenTarget}
                    specificationHref={specificationHref}
                    renderSpecificationLink={renderSpecificationLink}
                  />
                ) : null}
                {visible && !visible.items.length && !state.loading ? (
                  <SpecsOverviewEmpty
                    collection={state.collection}
                    searching={Boolean(search.term)}
                    onClearSearch={search.clear}
                    onCreate={onCreate}
                    createDisabled={createDisabled}
                  />
                ) : null}
              </div>
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
