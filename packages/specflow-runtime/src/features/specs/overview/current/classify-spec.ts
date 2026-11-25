import type { CurrentSpecClassification } from '@nevo/specflow-contracts/specs/overview';

import type { CurrentSpecRecord, CurrentSpecSignalRecord } from '../repository/model';

/**
 * The Current section of a Specification, from where its workflow run stands: what needs a person
 * first (an attention signal, among them the workflow's attention items), then a run at a step or a
 * Session executing (in progress), then a run not started, then an ended run. The manifest status is
 * never read: it is not progress.
 */
export function classifyCurrentSpec(spec: CurrentSpecRecord): CurrentSpecClassification {
  const attention = [...(spec.signals ?? [])]
    .filter(isAttentionSignal)
    .sort((left, right) => right.priority - left.priority)[0];

  if (attention) {
    return {
      section: 'requires-attention',
      ...(attention.attentionReason === undefined ? {} : { reason: attention.attentionReason }),
      ...(attention.count === undefined ? {} : { count: attention.count }),
    };
  }

  if (spec.currentExecutions && spec.currentExecutions.length > 0) {
    return { section: 'in-progress' };
  }

  if (spec.signals === null || spec.currentExecutions === null || spec.workflow === null) {
    return { section: 'unknown' };
  }

  switch (spec.workflow.kind) {
    case 'not-started':
      return { section: 'not-started' };
    case 'step':
      return { section: 'in-progress' };
    case 'ended':
      return { section: 'ended' };
  }
}

function isAttentionSignal(signal: CurrentSpecSignalRecord): boolean {
  return signal.kind === 'attention';
}
