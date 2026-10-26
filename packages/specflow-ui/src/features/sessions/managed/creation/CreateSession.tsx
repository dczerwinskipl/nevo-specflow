import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
import type { ManagedSessionsApi } from '../api';
import { createSessionRequest } from './request';

export function CreateSession({ owner, api }: { owner: string; api: ManagedSessionsApi }) {
  const { t } = useTranslation(),
    navigate = useNavigate();
  const retained = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      /* Dispatch remains blocked without retention. */
    }
    return createSessionRequest(owner, storage);
  }, [owner]);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const providers = useQuery({
    queryKey: ['managed-session-providers', owner],
    queryFn: ({ signal }) => api.providers(signal),
  });
  const pending = retained.pending();
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const provider = providers.data?.items.find(
    (item) => item.readiness === 'ready' && item.modes.includes('read-only'),
  );
  async function create() {
    if (busy || (!provider && !pending)) return;
    const input = pending ?? {
      providerId: provider!.providerId,
      modelId: provider!.models[0]?.modelId,
      mode: 'read-only' as const,
    };
    setBusy(true);
    setFailed(false);
    try {
      const result = await retained.send(input, (request) => api.create(request));
      if (!alive.current) return;
      await navigate({ to: '/sessions/$sessionId', params: { sessionId: result.sessionId } });
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setBusy(false);
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
              {provider?.providerId === 'mock' && (
                <p className="text-body-md text-content-muted">{t('managedSession.mockNote')}</p>
              )}
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
              <Button disabled={busy || (!provider && !pending)} onClick={() => void create()}>
                {t(pending ? 'managedSession.retryCreate' : 'managedSession.create')}
              </Button>
            </div>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}
