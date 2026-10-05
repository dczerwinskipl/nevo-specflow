import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  EmptyState,
  SegmentedControl,
  Skeleton,
  TextInput,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';

import type { SpecsCollection, SpecsOverviewState, SteeringTarget } from './model';
import { SpecSteeringCollection } from './SpecSteeringCollection';

export interface SpecsOverviewProps {
  readonly state: SpecsOverviewState;
  readonly onCollectionChange: (collection: SpecsCollection) => void;
  readonly onRefresh: () => void;
  readonly onOpenTarget?: (target: SteeringTarget) => void;
  readonly onCreate?: () => void;
  readonly onCreateSession?: () => void;
  readonly sample?: boolean;
  readonly specificationHref?: (specId: string) => string;
}

export function SpecsOverview({
  state,
  onCollectionChange,
  onRefresh,
  onOpenTarget,
  onCreate,
  onCreateSession,
  sample = false,
  specificationHref,
}: SpecsOverviewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState({ collection: state.collection, value: '' });
  const term = search.collection === state.collection ? search.value : '';
  const projection =
    state.projection?.collection === state.collection ? state.projection : undefined;
  const searchable = Boolean(
    projection && (state.collection === 'archive' || projection.items.length >= 12),
  );
  const visible = projection
    ? {
        ...projection,
        items: projection.items.filter((item) =>
          item.title.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()),
        ),
      }
    : undefined;
  const busy = state.loading || state.refreshing;

  return (
    <AppWorkspace
      labels={{
        backToPrimary: t('navigation.back'),
        closeSecondary: t('navigation.closeSecondary'),
        openNavigation: t('navigation.open'),
      }}
      split="primary"
    >
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={t('specs.title')}
            labels={{
              moreActions: t('specs.moreActions'),
              menuScope: t('specs.title'),
            }}
            actions={[
              ...(onCreate
                ? [
                    {
                      id: 'create',
                      label: t('specs.create'),
                      icon: 'plus' as const,
                      primary: true,
                      onPress: onCreate,
                    },
                  ]
                : []),
              {
                id: 'create-session',
                icon: 'chat-plus',
                label: t('specs.createSession'),
                disabled: !onCreateSession,
                onPress: () => onCreateSession?.(),
              },
              {
                id: 'refresh',
                icon: 'refresh',
                label: busy ? t('specs.refreshing') : t('specs.refresh'),
                disabled: busy,
                onPress: onRefresh,
              },
            ]}
          />
        }
      >
        <AppContent>
          <AppWorkspaceBody className="py-6">
            <AppContentContainer align="start" className="grid gap-4" size="full">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <SegmentedControl
                  aria-label={t('specs.collection')}
                  value={state.collection}
                  onValueChange={(value) => onCollectionChange(value as SpecsCollection)}
                >
                  <SegmentedControl.Item value="active">{t('specs.active')}</SegmentedControl.Item>
                  <SegmentedControl.Item value="archive">
                    {t('specs.archive')}
                  </SegmentedControl.Item>
                </SegmentedControl>
                {sample ? (
                  <Typography className="text-content-muted" variant="body-sm">
                    {t('specs.sample')}
                  </Typography>
                ) : null}
              </div>
              {sample && !specificationHref ? (
                <Typography className="text-content-secondary" variant="body-sm">
                  {t('specs.previewDescription')}
                </Typography>
              ) : null}
              {searchable ? (
                <TextInput
                  aria-label={t('specs.search')}
                  placeholder={t('specs.search')}
                  value={term}
                  onChange={(event) =>
                    setSearch({ collection: state.collection, value: event.target.value })
                  }
                  className="w-full"
                />
              ) : null}
              {state.refreshing ? (
                <Typography role="status" variant="body-sm" className="text-content-muted">
                  {t('specs.refreshing')}
                </Typography>
              ) : null}
              {state.error ? (
                <Alert
                  role="alert"
                  tone={projection ? 'attention' : 'danger'}
                  title={t(projection ? 'specs.refreshFailed' : 'specs.unavailable')}
                >
                  <p>
                    {t(
                      projection
                        ? 'specs.refreshFailedDescription'
                        : 'specs.unavailableDescription',
                    )}
                  </p>
                  <Button className="mt-3" onClick={onRefresh} disabled={busy} variant="secondary">
                    {t('common.retry')}
                  </Button>
                </Alert>
              ) : null}
              {state.loading ? (
                <div aria-label={t('specs.loading')} role="status" className="grid gap-6">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div aria-hidden="true" className="grid gap-3" key={index}>
                      <Skeleton className="h-5 w-3/5" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  ))}
                </div>
              ) : null}
              {projection && !state.loading ? (
                <SpecSteeringCollection
                  projection={projection}
                  query={term}
                  onOpenTarget={onOpenTarget}
                  specificationHref={specificationHref}
                />
              ) : null}
              {visible && !visible.items.length && !state.loading ? (
                <EmptyState
                  className="border-0"
                  title={t(
                    term
                      ? 'specs.noResults'
                      : state.collection === 'active'
                        ? 'specs.emptyActive'
                        : 'specs.emptyArchive',
                  )}
                  description={t(
                    term
                      ? 'specs.noResultsDescription'
                      : state.collection === 'active'
                        ? 'specs.emptyActiveDescription'
                        : 'specs.emptyArchiveDescription',
                  )}
                  actions={
                    term ? (
                      <Button
                        variant="secondary"
                        onClick={() => setSearch({ collection: state.collection, value: '' })}
                      >
                        {t('specs.clearSearch')}
                      </Button>
                    ) : onCreate && state.collection === 'active' ? (
                      <Button leadingIcon="plus" onClick={onCreate}>
                        {t('specs.create')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
