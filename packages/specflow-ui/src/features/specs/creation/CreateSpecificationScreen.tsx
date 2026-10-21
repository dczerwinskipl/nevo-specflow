import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { creationKeys } from './api';
import { CreateShell } from './CreateShell';
import { CreateSpecificationForm } from './CreateSpecificationForm';

interface Props {
  specId?: string;
  onCreated: (id: string, document?: string) => void;
  onSession: (spec: string, session: string) => void;
  onBack: () => void;
}

/** Loads the runtime mode and the catalogue, then shows the Create form (or why it cannot be shown). */
export function CreateSpecificationScreen(props: Props) {
  const { t } = useTranslation();
  const services = useAppServices();
  const runtime = useQuery({
    queryKey: ['runtime-info'],
    queryFn: ({ signal }) => services.runtimeInfoApi.getInfo(signal),
  });
  const catalogue = useQuery({
    queryKey: creationKeys.catalogue(props.specId),
    queryFn: ({ signal }) => services.creationApi.catalogue(props.specId, signal),
    enabled: runtime.data?.dataMode === 'demo',
  });
  const fallback = (children: ReactNode) => (
    <CreateShell specId={props.specId} containerClassName="grid gap-6">
      <ApplicationContextLine
        className="mb-0"
        specId={props.specId}
        view={props.specId ? 'new-session' : 'new-specification'}
      />
      {children}
    </CreateShell>
  );
  if (runtime.isPending || (runtime.data?.dataMode === 'demo' && catalogue.isPending))
    return fallback(<p role="status">{t('create.loading')}</p>);
  if (runtime.data?.dataMode !== 'demo')
    return fallback(<Alert tone="attention" title={t('create.demoOnly')} />);
  if (!catalogue.data)
    return fallback(
      <Alert tone="attention" title={t('create.loadError')}>
        <Button onClick={() => void catalogue.refetch()}>{t('common.retry')}</Button>
      </Alert>,
    );
  return (
    <CreateSpecificationForm
      key={props.specId ?? 'new'}
      specId={props.specId}
      onCreated={props.onCreated}
      onSession={props.onSession}
      catalogue={catalogue.data}
      configurationUnavailable={runtime.isError || catalogue.isError}
      onRefresh={() => void Promise.all([runtime.refetch(), catalogue.refetch()])}
    />
  );
}
