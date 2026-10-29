import {
  applicationLocationHeader,
  ApplicationContextLine,
} from '../../../app/navigation/ApplicationLocation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { isHttpClientError } from '@nevo/http-client';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  Button,
  ScrollArea,
  TextArea,
  Typography,
  WorkspaceHeader,
  useWorkspaceCapabilities,
  useSecondaryNavigation,
} from '@nevo/ui';
import { useAppServices } from '../../../app/useAppServices';
import { SessionProviderIcon } from '../shared/SessionProviderIcon';
import { sessionKeys } from '../queries';
import { SessionContextPanel, sessionContextStack } from '../context/SessionContextPanel';
import { composerDraftKey } from '../composer/composerDraftStore';
import { useComposerDraft } from '../SessionStateProvider';
export function SessionScreen({
  specId,
  sessionId,
}: {
  specId: string;
  sessionId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const { sessionsApi } = useAppServices();
  const { supportsSplit } = useWorkspaceCapabilities();
  const navigation = useSecondaryNavigation();
  const [draft, setDraft] = useComposerDraft(composerDraftKey(specId, sessionId));
  const query = useQuery({
    queryKey: sessionKeys.detail(specId, sessionId),
    queryFn: ({ signal }) => sessionsApi.session(specId, sessionId, signal),
  });
  // A definitive 404 is not transient: retrying cannot change the outcome.
  const notFound = isHttpClientError(query.error) && query.error.status === 404;

  return (
    <AppWorkspace
      scroll="content"
      fit="available"
      split="primary"
      labels={{
        ...workspaceLabels,
        backToPrimary: t('sessions.demo.backToSession'),
        closeSecondary: t('sessions.demo.closeContext'),
      }}
    >
      <AppWorkspace.Primary
        header={applicationLocationHeader({
          title: query.data
            ? t('sessions.demo.titleWithProfile', { profile: query.data.configuration.profile })
            : t('sessions.demo.title'),
          view: 'session',
          specId,
          actions: !supportsSplit
            ? [
                {
                  id: 'context',
                  label: t('sessions.demo.context'),
                  icon: 'file',
                  onPress: () => void navigation.open(sessionContextStack, { specId, sessionId }),
                },
              ]
            : undefined,
        })}
      >
        <AppContent className="h-full w-full">
          <div className="flex h-full min-h-0 flex-col">
            {query.isPending ? (
              <p role="status" className="p-5">
                {t('sessions.demo.loading')}
              </p>
            ) : !query.data || query.isError ? (
              <Alert tone="attention" title={t('sessions.demo.unavailable')}>
                {notFound ? (
                  <p>{t('sessions.demo.notFound')}</p>
                ) : (
                  <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
                )}
              </Alert>
            ) : (
              <>
                <div className="shrink-0 px-4 pt-4">
                  <ApplicationContextLine specId={specId} view="session" />
                </div>
                <div className="flex shrink-0 items-center gap-3 px-4 py-3">
                  <SessionProviderIcon providerId={query.data.configuration.providerId} />
                  <div>
                    <Typography as="h1" variant="title-md">
                      {query.data.configuration.profile}
                    </Typography>
                    <p className="text-body-sm text-content-muted">
                      {query.data.configuration.providerTitle} ·{' '}
                      {query.data.configuration.modelTitle} · {query.data.configuration.mode}
                      {query.data.configuration.effort
                        ? ` · ${query.data.configuration.effort}`
                        : ''}
                    </p>
                  </div>
                </div>
                <ScrollArea
                  className="min-h-0 flex-1"
                  contentClassName="flex min-h-full flex-col px-5 py-7"
                >
                  <AppContentContainer
                    size="standard"
                    className="flex flex-1 flex-col justify-center"
                  >
                    <Typography as="h2" variant="title-lg">
                      {t('sessions.demo.startTitle')}
                    </Typography>
                    <p className="mt-3 max-w-prose text-body-sm text-content-muted">
                      {t('sessions.demo.startBody')}
                    </p>
                  </AppContentContainer>
                </ScrollArea>
                <div className="shrink-0 px-5 pb-5">
                  <AppContentContainer
                    size="standard"
                    className="grid gap-3 rounded-control border border-border-subtle p-4"
                  >
                    <label htmlFor="demo-session-message" className="text-body-sm font-medium">
                      {t('sessions.demo.messageLabel')}
                    </label>
                    <TextArea
                      id="demo-session-message"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      placeholder={t('sessions.demo.messagePlaceholder')}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-body-sm text-content-muted">
                        {t('sessions.demo.demoNote')}
                      </p>
                      <Button disabled>{t('create.send')}</Button>
                    </div>
                  </AppContentContainer>
                </div>
              </>
            )}
          </div>
        </AppContent>
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary header={<WorkspaceHeader title={t('sessions.demo.context')} />}>
        <SessionContextPanel specId={specId} sessionId={sessionId} />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}
