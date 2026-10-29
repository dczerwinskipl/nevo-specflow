import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useAppServices } from '../../../app/useAppServices';
import { specificationKeys } from '../../specs/read-model';
import { useNotify } from '../../../shared/notifications/notifications';
import { useSessionRecovery } from '../SessionStateProvider';
/** The specification and its workspace already exist; only the initial Session is retried. */
export function SessionRecoveryNotice({ specId }: { specId: string }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { recovery, resolve } = useSessionRecovery(specId);
  const { sessionsApi } = useAppServices();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const retry = useMutation({
    mutationFn: async () => {
      if (!recovery) {
        return;
      }

      const session = await sessionsApi.allocate(specId, recovery.session);
      resolve();
      notify(t('create.sessionReady'));
      await cache.invalidateQueries({ queryKey: specificationKeys.detail(specId) });
      void navigate({
        to: '/specs/$specId/sessions/$sessionId',
        params: { specId, sessionId: session.sessionId },
        search: { collection },
      });
    },
  });
  if (!recovery) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-border-subtle p-3">
      <Alert tone="attention" title={t('create.recovery.title')}>
        <p className="text-body-sm">{t('create.recovery.body')}</p>
        {retry.isError && (
          <p role="alert" className="mt-2 text-body-sm">
            {t('create.recovery.stillUnconfirmed')}
          </p>
        )}
        <Button
          size="sm"
          className="mt-3"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          {retry.isPending ? t('create.submit.checking') : t('create.recovery.retry')}
        </Button>
      </Alert>
    </div>
  );
}
