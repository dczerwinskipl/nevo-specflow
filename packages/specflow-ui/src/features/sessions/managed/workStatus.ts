import type { WorkSummary } from '@nevo/specflow-contracts/sessions';

/**
 * The ONE Work/ToolAction state vocabulary both levels of the same Work model use — the
 * Conversation's Work block (L1) and Work history (L2/L3) — so a state never gets a second,
 * independently chosen colour or wording in one of them (sessions.md `WorkStateSchema`; labels are
 * `managedSession.workState.*`, shared by both views).
 */
export type WorkStateTone = 'neutral' | 'info' | 'success' | 'attention' | 'danger';

export function workStateTone(state: WorkSummary['state']): WorkStateTone {
  switch (state) {
    case 'active':
      return 'info';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
    case 'interrupted':
      return 'attention';
    case 'queued':
    case 'waiting':
    case 'expired':
    default:
      return 'neutral';
  }
}

/**
 * Text colour for a state's visible label. Only the exceptional tones colour text — a plain
 * completed/running/queued label stays ordinary secondary text, so finished work reads calmer than
 * active or failed work, and colour is never the only carrier (the state word itself is always
 * there, visibly or for assistive tech).
 */
export function workStateTextClassName(tone: WorkStateTone): string {
  switch (tone) {
    case 'danger':
      return 'text-status-danger';
    case 'attention':
      return 'text-status-attention';
    default:
      return 'text-content-secondary';
  }
}
