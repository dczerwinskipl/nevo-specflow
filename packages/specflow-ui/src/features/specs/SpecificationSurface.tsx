import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  Icon,
  Link,
  Spinner,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import type { SpecificationWorkspaceData, SpecificationWorkspaceView } from './workspace/model';
import { SpecificationWorkspace } from './workspace/SpecificationWorkspace';
import { useSpecificationWorkspace } from './useSpecificationWorkspace';

export interface SpecificationSurfaceProps {
  readonly specId: string;
  readonly overviewHref?: string;
  readonly onBack?: () => void;
  readonly initialView?: SpecificationWorkspaceView;
  readonly initialTask?: string;
  readonly data?: SpecificationWorkspaceData;
  readonly onRefresh?: () => void | Promise<void>;
  readonly onExecute?: (agent: string, tasks: readonly string[]) => void | Promise<void>;
  readonly onNewConversation?: (agent: string) => void | Promise<void>;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onDiff?: (file: string) => void;
}

/** Specification workspace screen. */
export function SpecificationSurface(props: SpecificationSurfaceProps) {
  const { data: propData } = props;

  // If explicit data is provided (e.g. from Storybook or tests), render directly.
  if (propData) {
    return <SpecificationWorkspace {...props} data={propData} />;
  }

  // Otherwise, use the canonical feature query.
  return <SpecificationSurfaceConnected {...props} />;
}

function SpecificationSurfaceConnected({
  specId,
  overviewHref,
  onBack,
  initialView,
  initialTask,
  onRefresh,
  onExecute,
  onNewConversation,
  onOpenSession,
  onDiff,
}: SpecificationSurfaceProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, errorStatus, refetch } = useSpecificationWorkspace(specId);

  if (isError) {
    return (
      <AppWorkspace
        split="primary"
        labels={{
          backToPrimary: t('navigation.back'),
          closeSecondary: t('navigation.closeSecondary'),
          openNavigation: t('navigation.open'),
        }}
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title={t('specification.title')} />}>
          <AppContent className="w-content-xwide max-w-full">
            <AppWorkspaceBody className="py-8">
              <AppContentContainer align="start" size="full" className="grid gap-6">
                {overviewHref ? (
                  <Link
                    href={overviewHref}
                    className="w-fit"
                    onClick={(event) => {
                      if (
                        onBack &&
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        onBack();
                      }
                    }}
                  >
                    <span className="inline-flex items-center gap-2 text-body-sm font-medium">
                      <Icon name="arrow-right" size="sm" className="rotate-180" />
                      <span data-spec-back-label>{t('specification.backToSpecifications')}</span>
                    </span>
                  </Link>
                ) : null}

                <div
                  role="alert"
                  className="rounded-control border border-border-default bg-surface-subtle p-6 grid gap-3 max-w-content-standard"
                >
                  <div className="flex items-center gap-2 text-status-attention">
                    <Icon name="triangle-alert" size="sm" />
                    <Typography
                      as="h2"
                      variant="title-sm"
                      className="font-semibold text-content-primary"
                    >
                      {errorStatus === 404
                        ? t('specification.notFoundTitle')
                        : t('specification.unavailableTitle')}
                    </Typography>
                  </div>

                  <Typography variant="body-sm" className="text-content-secondary">
                    {errorStatus === 404
                      ? t('specification.notFoundDescription', { id: specId })
                      : t('specification.unavailableDescription', { id: specId })}
                  </Typography>

                  <div className="mt-2 flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                      {t('common.retry')}
                    </Button>
                    {onBack ? (
                      <Button variant="ghost" size="sm" onClick={onBack}>
                        {t('specification.backToSpecifications')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    );
  }

  if (isLoading || !data) {
    return (
      <AppWorkspace
        split="primary"
        labels={{
          backToPrimary: t('navigation.back'),
          closeSecondary: t('navigation.closeSecondary'),
          openNavigation: t('navigation.open'),
        }}
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title={t('specification.title')} />}>
          <AppContent className="w-content-xwide max-w-full">
            <AppWorkspaceBody className="py-12">
              <AppContentContainer
                align="start"
                size="full"
                className="flex flex-col items-center justify-center gap-4 text-center"
              >
                <Spinner size="md" aria-label={t('common.loading')} />
                <Typography variant="body-sm" className="text-content-muted">
                  {t('specification.loadingWorkspace', { id: specId })}
                </Typography>
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    );
  }

  return (
    <SpecificationWorkspace
      specId={specId}
      data={data}
      overviewHref={overviewHref}
      onBack={onBack}
      initialView={initialView}
      initialTask={initialTask}
      onRefresh={onRefresh ?? (() => void refetch())}
      onExecute={onExecute}
      onNewConversation={onNewConversation}
      onOpenSession={onOpenSession}
      onDiff={onDiff}
    />
  );
}
