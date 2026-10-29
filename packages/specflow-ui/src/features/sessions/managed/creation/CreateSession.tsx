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
  Field,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@nevo/ui';
import type { ManagedSessionsApi } from '../api';
import { createSessionRequest } from './request';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';

function executableModes(provider: ProviderDescriptor) {
  return (
    provider.providerModes?.filter(
      (mode) =>
        mode.readiness === 'ready' &&
        mode.authorized !== false &&
        provider.modes.includes(mode.mode),
    ) ?? []
  );
}

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
  const [selection, setSelection] = useState<{ providerId: string; modeId: string }>();
  const readyProviders = providers.data?.items.filter((item) => item.readiness === 'ready');
  const authenticationRequired = providers.data?.items.some(
    (item) => item.readiness === 'authenticationRequired',
  );
  const provider =
    readyProviders?.find((item) =>
      executableModes(item).some((mode) => mode.mode === 'workspace-write'),
    ) ??
    readyProviders?.find((item) =>
      item.providerModes ? executableModes(item).length > 0 : item.modes.includes('read-only'),
    );
  const availableModes = provider ? executableModes(provider) : [];
  const writerModes = availableModes.filter((mode) => mode.mode === 'workspace-write');
  const preferredModes = writerModes.length ? writerModes : availableModes;
  const defaultMode =
    preferredModes.find((mode) => mode.modeId === provider?.defaultModeId) ?? preferredModes[0];
  const modeId =
    selection?.providerId === provider?.providerId ? selection?.modeId : defaultMode?.modeId;
  const nativeMode = provider?.providerModes?.find((mode) => mode.modeId === modeId);
  const canCreate = Boolean(
    provider && (!provider.providerModes || availableModes.some((mode) => mode.modeId === modeId)),
  );
  async function create() {
    if (busy || (!canCreate && !pending)) {
      return;
    }

    const input = pending ?? {
      providerId: provider!.providerId,
      mode: nativeMode?.mode ?? ('read-only' as const),
      ...(nativeMode ? { providerModeId: nativeMode.modeId } : {}),
    };
    setBusy(true);
    setFailed(false);
    try {
      const result = await retained.send(input, (request) => api.create(request));
      if (!alive.current) {
        return;
      }

      await navigate({ to: '/sessions/$sessionId', params: { sessionId: result.sessionId } });
    } catch {
      if (alive.current) {
        setFailed(true);
      }
    } finally {
      if (alive.current) {
        setBusy(false);
      }
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
              {provider?.providerModes && (
                <Field disabled={busy || Boolean(pending)}>
                  <Field.Label>{t('managedSession.nativeMode')}</Field.Label>
                  <Select
                    value={modeId}
                    onValueChange={(modeId) =>
                      setSelection({ providerId: provider.providerId, modeId })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {provider.providerModes.map((mode) => (
                        <SelectItem
                          key={mode.modeId}
                          value={mode.modeId}
                          disabled={
                            !availableModes.some((available) => available.modeId === mode.modeId)
                          }
                        >
                          {mode.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nativeMode?.reason && <Field.Description>{nativeMode.reason}</Field.Description>}
                </Field>
              )}
              {providers.isPending ? (
                <p role="status">{t('managedSession.loading')}</p>
              ) : provider ? (
                <p className="text-body-md">{provider.title}</p>
              ) : (
                <Alert
                  tone="attention"
                  title={t(
                    authenticationRequired
                      ? 'managedSession.authenticationRequired'
                      : 'managedSession.unavailable',
                  )}
                >
                  {authenticationRequired && <p>{t('managedSession.authenticationHelp')}</p>}
                  <Button onClick={() => void providers.refetch()}>{t('common.retry')}</Button>
                </Alert>
              )}
              {failed && <Alert tone="attention" title={t('managedSession.commandFailed')} />}
              <Button disabled={busy || (!canCreate && !pending)} onClick={() => void create()}>
                {t(pending ? 'managedSession.retryCreate' : 'managedSession.create')}
              </Button>
            </div>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}
