import type { StatusTone } from '@nevo/ui';

import type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecSteeringItemProjection,
  SteeringKind,
} from '@nevo/specflow-contracts/specs-overview';
export type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecSteeringItemProjection,
  SpecSteeringSignal,
  SteeringKind,
  SteeringTarget,
} from '@nevo/specflow-contracts/specs-overview';

export interface SpecRowSelection {
  readonly selected: boolean;
  readonly onSelectedChange: (selected: boolean) => void;
}

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
}

export const steeringTone: Record<SteeringKind, StatusTone> = {
  attention: 'attention',
  ready: 'neutral',
  working: 'info',
  issue: 'neutral',
  quiet: 'neutral',
};

export function orderedSignals(item: SpecSteeringItemProjection) {
  return [...item.signals].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function steeringGroups(items: readonly SpecSteeringItemProjection[]) {
  const groups: { kind: SteeringKind; items: SpecSteeringItemProjection[] }[] = [
    { kind: 'attention', items: [] },
    { kind: 'ready', items: [] },
    { kind: 'working', items: [] },
    { kind: 'quiet', items: [] },
  ];
  const sorted = [...items].sort(
    (a, b) =>
      (orderedSignals(b)[0]?.priority ?? 0) - (orderedSignals(a)[0]?.priority ?? 0) ||
      a.id.localeCompare(b.id),
  );
  for (const item of sorted) {
    const kind =
      item.steeringAvailable === false ? 'quiet' : (orderedSignals(item)[0]?.kind ?? 'quiet');
    groups.find((group) => group.kind === (kind === 'issue' ? 'quiet' : kind))!.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}
