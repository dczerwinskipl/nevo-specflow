import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { FeatureUnavailable } from '../../../app/errors/FeatureUnavailable';
import { useAppServices } from '../../../app/useAppServices';
import { runtimeKeys, useRuntimeMode } from '../../../app/useRuntimeMode';
import { creationKeys } from './api';
import { CreateProjectForm } from './CreateProjectForm';
import { CreateShell } from './CreateShell';
import { CreateSpecificationForm } from './CreateSpecificationForm';

interface Props {
  specId?: string;
  onCreated: (id: string, document?: string) => void;
  /**
   * A Create on a project Runtime was handed over: continue on the page of its operation. A stored
   * unfinished operation is resumed with `replace`, so Back does not return to the empty form.
   */
  onProjectStarted: (operationId: string, options: { replace: boolean }) => void;
  onSession: (spec: string, session: string) => void;
  onBack: () => void;
}

/**
 * Decides by the Runtime mode which Create flow is shown: the real one on a project Runtime, the
 * demo catalogue flow on a demo Runtime. The two have different contracts and never mix.
 */
export function CreateSpecificationScreen(props: Props) {
  const { t } = useTranslation();
  const mode = useRuntimeMode();
  const queryClient = useQueryClient();
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
  if (mode === 'loading') return fallback(<p role="status">{t('create.loading')}</p>);
  if (mode === 'unavailable')
    return fallback(
      <Alert tone="attention" title={t('create.loadError')}>
        <Button onClick={() => void queryClient.invalidateQueries({ queryKey: runtimeKeys.info })}>
          {t('common.retry')}
        </Button>
      </Alert>,
    );
  // Agent sessions exist only in the demo Runtime.
  if (mode === 'project')
    return props.specId ? (
      fallback(<FeatureUnavailable />)
    ) : (
      <CreateProjectForm onStarted={props.onProjectStarted} />
    );
  return <DemoCreateSpecification {...props} fallback={fallback} />;
}

function DemoCreateSpecification(props: Props & { fallback: (children: ReactNode) => ReactNode }) {
  const { t } = useTranslation();
  const services = useAppServices();
  const runtime = useQuery({
    queryKey: runtimeKeys.info,
    queryFn: ({ signal }) => services.runtimeInfoApi.getInfo(signal),
  });
  const catalogue = useQuery({
    queryKey: creationKeys.catalogue(props.specId),
    queryFn: ({ signal }) => services.creationApi.catalogue(props.specId, signal),
  });
  if (catalogue.isPending) return props.fallback(<p role="status">{t('create.loading')}</p>);
  if (!catalogue.data)
    return props.fallback(
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
