import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppWorkspace,
  AppWorkspaceProvider,
  AppContent,
  Button,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import type { CreateSession } from '@nevo/specflow-contracts/sessions';
import { appRoute } from '../../../app/router/root';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';
import { ManagedSession } from './ManagedSession';

export const managedNewSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sessions/new',
  component: NewManagedSession,
});
export const managedSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sessions/$sessionId',
  component: ManagedSessionRoute,
});
function ManagedSessionRoute() {
  const { sessionId } = managedSessionRoute.useParams(),
    services = useAppServices();
  const auth = services.authStore.getState();
  const owner = auth.status === 'ready' ? authSessionIdentity(auth.session) : 'unavailable';
  return (
    <AppWorkspaceProvider>
      <ManagedSession
        key={owner + sessionId}
        api={services.managedSessionsApi}
        sessionId={sessionId}
        owner={owner}
      />
    </AppWorkspaceProvider>
  );
}
function NewManagedSession() {
  const { t } = useTranslation(),
    { managedSessionsApi: api } = useAppServices(),
    navigate = useNavigate();
  const providers = useQuery({
    queryKey: ['managed-session-providers'],
    queryFn: ({ signal }) => api.providers(signal),
  });
  const [pending, setPending] = useState<CreateSession>(),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const provider = providers.data?.items.find(
    (item) => item.readiness === 'ready' && item.modes.includes('read-only'),
  );
  async function create() {
    if (!provider || busy) return;
    const input = pending ?? {
      requestId: crypto.randomUUID(),
      providerId: provider.providerId,
      modelId: provider.models[0]?.modelId,
      mode: 'read-only' as const,
    };
    setPending(input);
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.create(input);
      await navigate({ to: '/sessions/$sessionId', params: { sessionId: result.sessionId } });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppWorkspaceProvider>
      <AppWorkspace scroll="content" fit="available">
        <AppWorkspace.Primary header={<WorkspaceHeader title={t('managedSession.new')} />}>
          <AppContent className="w-full">
            <div className="mx-auto grid max-w-content-standard gap-5 px-5 py-7">
              <Typography as="h1" variant="title-lg">
                {t('managedSession.new')}
              </Typography>
              <p className="text-body-md text-content-muted">{t('managedSession.mockNote')}</p>
              {providers.isPending ? (
                <p role="status">{t('managedSession.loading')}</p>
              ) : provider ? (
                <p className="text-body-md">{provider.title}</p>
              ) : (
                <Alert tone="attention" title={t('managedSession.unavailable')}>
                  <Button onClick={() => void providers.refetch()}>{t('common.retry')}</Button>
                </Alert>
              )}
              {failed && <Alert tone="attention" title={t('managedSession.commandFailed')} />}
              <Button disabled={busy || !provider} onClick={() => void create()}>
                {t(pending ? 'managedSession.retryCreate' : 'managedSession.create')}
              </Button>
            </div>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}
export const managedSessionAppRoutes = [managedNewSessionRoute, managedSessionRoute] as const;
