import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import { useRuntimeMode } from '../../../../app/useRuntimeMode';
import {
  SessionStartScreen,
  type ContextSpecification,
  type SessionStartSource,
} from '../../../sessions';
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
 * itself with the Specification pinned (new-session-ui-spec.md). Agent Sessions of a Specification
 * exist only in the demo Runtime; a project Runtime says so.
 */
export function NewSessionScreen({
  specId,
  onOpenSession,
  onOpenSpecification,
  onBack,
}: {
  specId: string;
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
  onBack: () => void;
}) {
  const mode = useRuntimeMode();
  if (mode === 'loading') {
    return (
      <SessionStartScreen
        source={loadingSource}
        onOpenSession={onOpenSession}
        onOpenSpecification={onOpenSpecification}
      />
    );
  }

  return (
    <CreateRuntimeGate specId={specId} view="new-session">
      {(resolved) =>
        resolved === 'demo' ? (
          <DemoNewSession
            key={specId}
            specId={specId}
            onOpenSession={onOpenSession}
            onOpenSpecification={onOpenSpecification}
          />
        ) : (
          <CreateFallback specId={specId} view="new-session">
            <FeatureUnavailable onBack={onBack} />
          </CreateFallback>
        )
      }
    </CreateRuntimeGate>
  );
}

function DemoNewSession({
  specId,
  onOpenSession,
  onOpenSpecification,
}: {
  specId: string;
  onOpenSession: (sessionId: string) => void;
  onOpenSpecification: (specification: ContextSpecification) => void;
}) {
  const source = useDemoStartSource(specId);

  return (
    <SessionStartScreen
      source={source}
      onOpenSession={onOpenSession}
      onOpenSpecification={onOpenSpecification}
    />
  );
}
