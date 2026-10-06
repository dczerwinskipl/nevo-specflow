import type { CurrentSpecClassification } from '@nevo/specflow-contracts/specs/overview';

import type { CurrentSpecRecord, CurrentSpecSignalRecord } from '../repository/model';

export function classifyCurrentSpec(spec: CurrentSpecRecord): CurrentSpecClassification {
  const attention = [...spec.signals]
    .filter(isAttentionSignal)
    .sort((left, right) => right.priority - left.priority)[0];

  if (attention) {
    return {
      section: 'requires-attention',
      ...(attention.attentionReason === undefined ? {} : { reason: attention.attentionReason }),
      ...(attention.count === undefined ? {} : { count: attention.count }),
    };
  }

  if (spec.currentExecutions.length > 0) {
    return { section: 'active' };
  }

  return spec.readyForWork ? { section: 'ready' } : { section: 'draft' };
}

function isAttentionSignal(signal: CurrentSpecSignalRecord): boolean {
  return signal.kind === 'attention';
}
