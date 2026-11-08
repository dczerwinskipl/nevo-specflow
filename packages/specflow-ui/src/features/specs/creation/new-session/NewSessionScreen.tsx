import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';
import { useAppServices } from '../../../../app/useAppServices';
import { useRuntimeMode } from '../../../../app/useRuntimeMode';
import {
  SessionStartScreen,
  startRouteRefusal,
  useAuthOwner,
  useManagedStartSource,
  type ContextFact,
  type ContextSpecification,
  type SessionStartSource,
} from '../../../sessions';
import { useSpecificationWorkspace } from '../../read-model';
import { useSpecificationNavigationSource } from '../../overview/useSpecificationNavigationMetadata';
import { CreateFallback, CreateRuntimeGate } from '../CreateRuntimeGate';
import { useDemoStartSource } from './useDemoStartSource';

/** The Runtime mode is still being read: the shell is there already, its catalogue loading. */
const loadingSource: SessionStartSource = {
  owner: 'unavailable',
  catalogue: { status: 'loading' },
  specification: { status: 'loading' },
  start: () => new Promise(() => undefined),
};

/**
 * New Session of an existing Specification (`/specs/$specId/sessions/new`): the Session screen
 * itself with the Specification pinned (new-session-ui-spec.md). A project Runtime starts it with
 * the composed create, the demo at its own start route. Opened directly, the start form is replaced
 * by a refusal when the workspace's `startSession` is `forbidden` or Sessions are turned off
 * (session-association-ux §5); while that read loads or failed the form renders.
 */
export function NewSessionScreen({
  specId,
  collection = 'current',
  onOpenSession,
  onOpenSpecification,
  onBackToSpecification,
}: {
  specId: string;
  /** The Specification's collection the start was opened from. */
  collection?: 'current' | 'archive';
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
  onBackToSpecification: () => void;
}) {
  const mode = useRuntimeMode();
  const workspace = useSpecificationWorkspace(specId);
  const refusal = startRouteRefusal(workspace.data?.startSession);
  if (mode === 'loading') {
    return (
      <SessionStartScreen
        source={loadingSource}
        onOpenSession={onOpenSession}
        onOpenSpecification={onOpenSpecification}
      />
    );
  }

  if (refusal) {
    return <StartRefused specId={specId} refusal={refusal} onBack={onBackToSpecification} />;
  }

  return (
    <CreateRuntimeGate specId={specId} view="new-session">
      {(resolved) =>
        resolved === 'demo' ? (
          <DemoNewSession
            key={specId}
            specId={specId}
            collection={collection}
            onOpenSession={onOpenSession}
            onOpenSpecification={onOpenSpecification}
          />
        ) : (
          <ProjectNewSession
            key={specId}
            specId={specId}
            collection={collection}
            onOpenSession={onOpenSession}
            onOpenSpecification={onOpenSpecification}
          />
        )
      }
    </CreateRuntimeGate>
  );
}

/** The start route refused by the workspace read: why, and the way back. */
function StartRefused({
  specId,
  refusal,
  onBack,
}: {
  specId: string;
  refusal: 'forbidden' | 'sessions_disabled';
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <CreateFallback specId={specId} view="new-session">
      <div className="grid justify-items-start gap-4">
        <Typography as="p" variant="body-md" className="text-content-primary">
          {t(
            refusal === 'forbidden'
              ? 'sessionStart.forbiddenSpecification'
              : 'sessionStart.sessionsDisabled',
          )}
        </Typography>
        <Button variant="secondary" onClick={onBack}>
          {t('sessionStart.backToSpecification')}
        </Button>
      </div>
    </CreateFallback>
  );
}

/** The pinned Specification as Context shows it, from the navigation read of the workspace. */
function usePinnedSpecification(
  specId: string,
  collection: 'current' | 'archive',
): ContextFact<ContextSpecification> {
  const specification = useSpecificationNavigationSource(specId);
  const status = specification.status;
  const title = specification.metadata?.title;
  const key = specification.metadata?.key;

  return useMemo(
    () =>
      status === 'available' && title !== undefined
        ? {
            status: 'ready',
            value: {
              id: specId,
              key: key ?? '',
              title,
              collection: collection === 'archive' ? 'archived' : 'current',
            },
          }
        : status === 'failed'
          ? { status: 'unreadable' }
          : status === 'denied'
            ? { status: 'missing' }
            : { status: 'loading' },
    [status, title, key, specId, collection],
  );
}

function ProjectNewSession(props: {
  specId: string;
  collection: 'current' | 'archive';
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
}) {
  const owner = useAuthOwner();
  // A start belongs to the signed-in user who makes it: nothing is retained before that is known.
  if (owner === undefined) {
    return null;
  }

  return <ProjectStartScreen key={owner} owner={owner} {...props} />;
}

function ProjectStartScreen({
  owner,
  specId,
  collection,
  onOpenSession,
  onOpenSpecification,
}: {
  owner: string;
  specId: string;
  collection: 'current' | 'archive';
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
}) {
  const services = useAppServices();
  const fact = usePinnedSpecification(specId, collection);
  const specification = useMemo(() => ({ specId, fact }), [specId, fact]);
  const source = useManagedStartSource(
    owner,
    services.managedSessionsApi,
    services.sessionAssociationsApi,
    specification,
  );

  return (
    <SessionStartScreen
      source={source}
      onOpenSession={onOpenSession}
      onOpenSpecification={onOpenSpecification}
    />
  );
}

function DemoNewSession({
  specId,
  collection,
  onOpenSession,
  onOpenSpecification,
}: {
  specId: string;
  collection: 'current' | 'archive';
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
}) {
  const source = useDemoStartSource(specId, collection);

  return (
    <SessionStartScreen
      source={source}
      onOpenSession={onOpenSession}
      onOpenSpecification={onOpenSpecification}
    />
  );
}
