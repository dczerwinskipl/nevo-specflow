import { useEffect, useState } from 'react';
import { CreateShell } from '../CreateShell';
import { CreateLeaveDialog } from '../form/CreateLeaveDialog';
import { CreateProjectForm } from '../form/CreateProjectForm';
import { useCreateLeaveGuard } from '../form/useCreateLeaveGuard';
import { CreateMethodChoice } from '../options/CreateMethodChoice';
import {
  useCreateOperationStorage,
  type CreateFormDraft,
} from '../operation/createOperationStorage';
import { AgentEntryUnavailable, agentEntryUnavailable } from './AgentEntryUnavailable';
import { projectEntryPoints, type CreateEntryPointId } from './entryPoints';
import { useCreateAgents } from './useCreateAgents';

type Screen = 'choice' | CreateEntryPointId;

/**
 * New specification on a project Runtime: the start screen (the ways to start), then the form of
 * the way chosen. This component is the one draft owner above them: Back to the ways to start and
 * a tap on the other way (or **Use Manually**) keep the name, goal, archetype, workspace and agent.
 * "Back to form" of an operation's page (`restoreDraftOf`) opens that operation's form with its
 * draft, once; a plain entry opens the start screen with nothing filled in.
 */
export function CreateStartFlow({
  onStarted,
  restoreDraftOf,
}: {
  onStarted: (operationId: string) => void;
  restoreDraftOf?: string;
}) {
  const storage = useCreateOperationStorage();
  const [restored] = useState(() =>
    restoreDraftOf ? storage.loadDraft(restoreDraftOf) : undefined,
  );
  const [screen, setScreen] = useState<Screen>(() =>
    restored ? (restored.agent ? 'agent' : 'manual') : 'choice',
  );
  const [draft, setDraft] = useState<CreateFormDraft | undefined>(restored);
  // A draft carried from the other form holds the owner's entries: leaving still asks first.
  const [carried, setCarried] = useState(false);
  const { agents, refreshing, refresh } = useCreateAgents();

  // The restored draft is consumed by the first render: a reload of the form starts clean again.
  useEffect(() => {
    if (restored) {
      storage.clearDraft(restored.operationId);
    }
  }, [restored, storage]);

  const keep = (next: CreateFormDraft, to: Screen) => {
    // A refusal is shown once, on the form it was reported for.
    const { failure: _shown, ...rest } = next;
    setDraft(rest);
    setCarried(Boolean(rest.title.trim() || rest.goal.trim()));
    setScreen(to);
  };

  const leaveGuard = useCreateLeaveGuard({
    unfinished: false,
    dirty: screen === 'choice' && carried,
    isNavigationAllowed: () => false,
  });

  if (screen === 'choice') {
    const agentUnavailable = agentEntryUnavailable(agents);

    return (
      <CreateShell>
        <CreateMethodChoice
          entryPoints={projectEntryPoints}
          onChoose={setScreen}
          unavailable={{
            ...(agentUnavailable
              ? {
                  agent: (
                    <AgentEntryUnavailable
                      agents={agents}
                      refreshing={refreshing}
                      onRefresh={refresh}
                    />
                  ),
                }
              : {}),
          }}
        />
        <CreateLeaveDialog guard={leaveGuard} />
      </CreateShell>
    );
  }

  return (
    <CreateProjectForm
      key={screen}
      onStarted={onStarted}
      initialDraft={draft}
      draftEdited={carried}
      agentPath={screen === 'agent'}
      onBack={(next) => keep(next, 'choice')}
      onUseManual={(next) => keep(next, 'manual')}
    />
  );
}
