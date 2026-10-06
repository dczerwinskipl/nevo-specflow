import type { StatusTone } from '@nevo/ui';

import type {
  CurrentSpecSectionId,
  SpecsCollection,
  SpecsOverview,
} from '@nevo/specflow-contracts/specs/overview';

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
  SpecsCollection,
  SpecsOverview,
} from '@nevo/specflow-contracts/specs/overview';

export interface SpecsOverviewSource {
  readonly sample?: boolean;
  read(collection: SpecsCollection, signal: AbortSignal): Promise<SpecsOverview>;
}

export interface SpecsOverviewState {
  readonly collection: SpecsCollection;
  readonly projection?: SpecsOverview;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: boolean;
  readonly errorStatus?: number;
}

export const sectionTone: Record<CurrentSpecSectionId, StatusTone> = {
  'requires-attention': 'attention',
  active: 'info',
  ready: 'success',
  draft: 'neutral',
};

export const sectionTranslationKey = {
  'requires-attention': 'specs.sections.requiresAttention',
  active: 'specs.sections.active',
  ready: 'specs.sections.ready',
  draft: 'specs.sections.draft',
} as const satisfies Record<CurrentSpecSectionId, string>;
