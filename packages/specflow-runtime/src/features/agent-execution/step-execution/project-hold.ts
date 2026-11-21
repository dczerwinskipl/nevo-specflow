import type { AgentAttemptJournal, ProjectHold, WorkflowSubject } from '@nevo/specflow-engine';

/** An execution claim as the hold reads it: its phase and the intent's owner and attempt. */
export interface HoldingClaim {
  readonly phase: 'admitted' | 'dispatched' | 'unknown' | 'settled';
  readonly intent: { readonly ownerId: string; readonly attempt?: { readonly attemptId: string } };
}

/**
 * The agent holding the project: the first unsettled claim of an agent attempt's Turn whose journal
 * exists, the ones SpecFlow cannot tell the outcome of (`unknown`) first. A claim whose journal is
 * gone (removed by hand) names nothing, so the next one is tried. Git-free.
 */
export async function projectHoldOf(
  claims: readonly HoldingClaim[],
  sources: {
    journal(attemptId: string): Promise<AgentAttemptJournal | undefined>;
    title(subject: WorkflowSubject): Promise<string>;
  },
): Promise<ProjectHold | undefined> {
  const held = claims.filter(
    (claim) => claim.phase !== 'settled' && claim.intent.attempt !== undefined,
  );
  const ordered = [
    ...held.filter((claim) => claim.phase === 'unknown'),
    ...held.filter((claim) => claim.phase !== 'unknown'),
  ];
  for (const claim of ordered) {
    const journal = await sources.journal(claim.intent.attempt!.attemptId);
    if (!journal) {
      continue;
    }

    const { subject } = journal;

    return {
      kind: claim.phase === 'unknown' ? 'agent-outcome-unknown' : 'agent-working',
      subject: {
        specId: subject.specId,
        ...(subject.kind === 'task' ? { taskId: subject.taskId } : {}),
        title: await sources.title(subject),
      },
      sessionId: journal.actor.details.sessionId ?? claim.intent.ownerId,
    };
  }

  return undefined;
}
