import type { StatusTone } from '@nevo/ui';

import type {
  CurrentSpecSectionId,
  SpecsCollection,
  SpecsOverview,
} from '@nevo/specflow-contracts/specs/overview';
import type { UnreadableCause } from '../../../shared/unreadable/unreadable';

export type {
  ArchivedSpecOverviewItem,
  ArchiveSpecsOverview,
  CurrentSpecClassification,
  CurrentSpecOverviewItem,
  CurrentSpecSectionId,
  CurrentSpecsOverview,
  CurrentSpecAttentionReason,
  SpecOverviewItem,
  CurrentSpecSignal,
  CurrentSpecSignalKind,
  CurrentSpecTarget,
  CurrentSpecWorkflow,
  SpecsCollection,
  SpecsOverview,
} from '@nevo/specflow-contracts/specs/overview';

export interface SpecsOverviewState {
  readonly collection: SpecsCollection;
  readonly projection?: SpecsOverview;
  readonly loading: boolean;
  readonly paused?: boolean;
  readonly refreshing: boolean;
  readonly error: boolean;
  /** Why the read failed (`error`), in the words the notice says it; absent: unexpected. */
  readonly errorCause?: UnreadableCause;
  /** The session may not use the Specs area at all (not a single forbidden resource). */
  readonly accessDenied?: boolean;
}

export const sectionTone: Record<CurrentSpecSectionId, StatusTone> = {
  'requires-attention': 'attention',
  'in-progress': 'info',
  'not-started': 'neutral',
  ended: 'neutral',
  unknown: 'neutral',
};

export const sectionTranslationKey = {
  'requires-attention': 'specifications.sections.requiresAttention',
  'in-progress': 'specifications.sections.inProgress',
  'not-started': 'specifications.sections.notStarted',
  ended: 'specifications.sections.ended',
  unknown: 'specifications.sections.unknown',
} as const satisfies Record<CurrentSpecSectionId, string>;
