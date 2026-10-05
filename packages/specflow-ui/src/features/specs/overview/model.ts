import type { StatusTone } from '@nevo/ui';

import type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecsOverviewGroupId,
} from '@nevo/specflow-contracts/specs-overview';
export type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecSteeringItemProjection,
  SpecArchiveItemProjection,
  SpecOverviewIdentity,
  CurrentSpecsOverviewProjection,
  ArchiveSpecsOverviewProjection,
  SpecSteeringSignal,
  SteeringKind,
  SteeringTarget,
  SpecsOverviewGroupId,
} from '@nevo/specflow-contracts/specs-overview';

export interface SpecsOverviewSource {
  readonly sample?: boolean;
  read(collection: SpecsCollection, signal: AbortSignal): Promise<SpecsOverviewProjection>;
}

export interface SpecsOverviewState {
  readonly collection: SpecsCollection;
  readonly projection?: SpecsOverviewProjection;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: boolean;
  readonly errorStatus?: number;
}

export const groupTone: Record<SpecsOverviewGroupId, StatusTone> = {
  'requires-attention': 'attention',
  active: 'info',
  ready: 'success',
  draft: 'neutral',
};
export const groupTranslationKey = {
  'requires-attention': 'specs.groups.requiresAttention',
  active: 'specs.groups.active',
  ready: 'specs.groups.ready',
  draft: 'specs.groups.draft',
} as const satisfies Record<SpecsOverviewGroupId, string>;
