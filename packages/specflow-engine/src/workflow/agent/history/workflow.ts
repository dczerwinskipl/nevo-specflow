import { findStep, historyOf, isReturnRecord, type AttemptOutcome } from '@nevo/workflow';

import { runReadRequest } from '../../../project/request-verification-memo';
import {
  loadSubject,
  loadTask,
  type WorkflowDependencies,
} from '../../operations/loaded-execution';
import type { WorkflowActor, WorkflowSubject } from '../../state/model';
import {
  readAgentAttemptHistory,
  type AgentAttemptHistory,
  type AgentHistorySources,
} from './attempt';

/** One record of a run's history, newest first in {@link WorkflowHistory}. */
export type WorkflowHistoryItem =
  | {
      readonly kind: 'attempt';
      readonly sequence: number;
      readonly step: string;
      readonly stepTitle: string;
      readonly attempt: number;
      readonly startedAt: string;
      /** Absent while the attempt is active. */
      readonly endedAt?: string;
      /** Who worked on it; absent for a wait step. */
      readonly actor?: WorkflowActor;
      readonly outcome?: AttemptOutcome;
      /** The label the workflow gives the transition the attempt took ("Breakdown approved"). */
      readonly transitionLabel?: string;
      /** An agent attempt's own history: its step events and the work it left. */
      readonly agent?: AgentAttemptHistory;
    }
  /** An owner return while no attempt was active. */
  | {
      readonly kind: 'return';
      readonly sequence: number;
      readonly at: string;
      readonly to: string;
      readonly feedback?: string;
    };

export interface WorkflowHistory {
  readonly subject: WorkflowSubject;
  /** Newest first; empty before the subject's run started. */
  readonly items: readonly WorkflowHistoryItem[];
  /** Older records were left out ({@link WORKFLOW_HISTORY_LIMIT}). */
  readonly truncated?: true;
}

/** The newest records a history read returns; the agent detail is read for those only. */
export const WORKFLOW_HISTORY_LIMIT = 200;

/**
 * The Workflow history of a subject: every attempt and return of its run, newest first, an agent
 * attempt with its step events and the work it left (`agent`, when `agent` sources are given; the
 * demo Runtime has none). Read-only and lock-free; bounded by the run record. An Engine read request:
 * its reads verify the Project Home and checkouts from on-disk evidence and spawn no Git process.
 */
export function readWorkflowHistory(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  subject: WorkflowSubject,
  agent?: AgentHistorySources,
): Promise<WorkflowHistory> {
  return runReadRequest(() => historyOfSubject(workflow, subject, agent));
}

async function historyOfSubject(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  subject: WorkflowSubject,
  agent: AgentHistorySources | undefined,
): Promise<WorkflowHistory> {
  const snapshot = await workflow.store.read(subject.specId);
  const started =
    subject.kind === 'specification'
      ? snapshot.specification !== undefined
      : loadTask(workflow.catalogue, snapshot, subject.taskId).run !== undefined;
  if (!started) {
    return { subject, items: [] };
  }

  const { run, definition } = loadSubject(workflow.catalogue, snapshot, subject);
  const records = historyOf(run).reverse();
  const shown = records.slice(0, WORKFLOW_HISTORY_LIMIT);
  const details = agent
    ? await readAgentAttemptHistory(agent, {
        subject,
        attempts: shown.flatMap((record) => (isReturnRecord(record) ? [] : [record])),
        manifests: snapshot.manifests.map((entry) => entry.value),
      })
    : new Map<string, AgentAttemptHistory>();
  const items = shown.map((record): WorkflowHistoryItem => {
    if (isReturnRecord(record)) {
      return {
        kind: 'return',
        sequence: record.sequence,
        at: record.at,
        to: record.to,
        ...(record.feedback !== undefined ? { feedback: record.feedback } : {}),
      };
    }

    const detail = details.get(`${record.step}#${String(record.attempt)}`);
    const step = findStep(definition, record.step);
    const outcome = record.outcome;
    const label =
      step?.kind === 'work' && outcome?.kind === 'transition'
        ? step.transitions.find((transition) => transition.id === outcome.transition)?.label
        : undefined;

    return {
      kind: 'attempt',
      sequence: record.sequence,
      step: record.step,
      stepTitle: step?.title ?? record.step,
      attempt: record.attempt,
      startedAt: record.startedAt,
      ...(record.endedAt !== undefined ? { endedAt: record.endedAt } : {}),
      ...(record.actor !== undefined ? { actor: record.actor } : {}),
      ...(record.outcome !== undefined ? { outcome: record.outcome } : {}),
      ...(label !== undefined ? { transitionLabel: label } : {}),
      ...(detail ? { agent: detail } : {}),
    };
  });

  return { subject, items, ...(records.length > shown.length ? { truncated: true as const } : {}) };
}
