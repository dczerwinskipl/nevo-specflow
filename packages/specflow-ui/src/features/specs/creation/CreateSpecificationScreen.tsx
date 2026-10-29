import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { documentCatalogueKeys } from '../../documents/read-model';
import { Alert, Button } from '@nevo/ui';
import { FeatureUnavailable } from '../../../app/errors/FeatureUnavailable';
import { useAppServices } from '../../../app/useAppServices';
import { useRuntimeInfo } from '../../../app/useRuntimeMode';
import { demoCreationKeys } from './api/api.demo';
import { CreateDemoForm } from './form/CreateDemoForm';
import { CreateProjectForm } from './form/CreateProjectForm';
import { CreateFallback, CreateRuntimeGate } from './CreateRuntimeGate';

interface Props {
  /** Present when only a Session is created for an existing specification (demo Runtime only). */
  specId?: string;
  onCreated: (id: string, document?: string) => void;
  /**
   * A Create on a project Runtime was handed over: continue on the page of its operation. Absent
   * where a project Runtime has no Create flow (a Session of an existing specification).
   */
  onProjectStarted?: (operationId: string) => void;
  /**
   * The operation whose draft the form restores: set only by "Back to form" of that operation's
   * page. Without it the form is always empty.
   */
  restoreDraftOf?: string;
  onSession: (spec: string, session: string) => void;
  onBack: () => void;
}

/**
 * Decides by the Runtime mode which Create flow is shown: the real one on a project Runtime, the
 * demo catalogue flow on a demo Runtime. The two have different contracts and never mix.
 */
export function CreateSpecificationScreen(props: Props) {
  const view = props.specId ? 'new-session' : 'new-specification';
  return (
    <CreateRuntimeGate specId={props.specId} view={view}>
      {(mode) =>
        mode === 'demo' ? (
          <DemoCreateSpecification {...props} />
        ) : // Agent sessions exist only in the demo Runtime.
        props.specId || !props.onProjectStarted ? (
          <CreateFallback specId={props.specId} view={view}>
            <FeatureUnavailable onBack={props.onBack} />
          </CreateFallback>
        ) : (
          <CreateProjectForm
            key={props.restoreDraftOf ?? 'new'}
            onStarted={props.onProjectStarted}
            restoreDraftOf={props.restoreDraftOf}
          />
        )
      }
    </CreateRuntimeGate>
  );
}

function DemoCreateSpecification(props: Props) {
  const { t } = useTranslation();
  const services = useAppServices();
  const runtime = useRuntimeInfo();
  const cache = useQueryClient();
  const view = props.specId ? 'new-session' : 'new-specification';
  const catalogue = useQuery({
    queryKey: demoCreationKeys.catalogue(props.specId),
    queryFn: ({ signal }) => services.demoCreationApi.catalogue(props.specId, signal),
  });
  if (catalogue.isPending)
    return (
      <CreateFallback specId={props.specId} view={view}>
        <p role="status">{t('create.loading')}</p>
      </CreateFallback>
    );
  if (!catalogue.data)
    return (
      <CreateFallback specId={props.specId} view={view}>
        <Alert tone="attention" title={t('create.loadError')}>
          <Button onClick={() => void catalogue.refetch()}>{t('common.retry')}</Button>
        </Alert>
      </CreateFallback>
    );
  return (
    <CreateDemoForm
      key={props.specId ?? 'new'}
      specId={props.specId}
      onCreated={props.onCreated}
      onSession={props.onSession}
      catalogue={catalogue.data}
      configurationUnavailable={runtime.isError || catalogue.isError}
      onRefresh={() => void Promise.all([runtime.refetch(), catalogue.refetch()])}
      onRefreshCatalogue={async () => {
        // The documents feature reads the same catalogue: it is refreshed with it.
        void cache.invalidateQueries({ queryKey: documentCatalogueKeys.all });
        const result = await catalogue.refetch();
        return result.isError ? undefined : result.data;
      }}
    />
  );
}
