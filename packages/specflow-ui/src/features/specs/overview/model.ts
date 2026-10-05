import type { StatusTone } from '@nevo/ui';

export type SpecsCollection = 'active' | 'archive';
export type SteeringKind = 'attention' | 'ready' | 'working' | 'issue' | 'quiet';
export type SteeringTarget =
  | { readonly kind: 'specification'; readonly specId: string }
  | { readonly kind: 'task'; readonly specId: string; readonly taskId: string }
  | { readonly kind: 'session'; readonly specId: string; readonly sessionId: string };

export interface SpecSteeringSignal {
  readonly id: string;
  readonly kind: SteeringKind;
  readonly label: string;
  readonly reason?: string;
  readonly attentionReason?: 'input' | 'decision' | 'review' | 'blocked';
  readonly priority: number;
  readonly target: SteeringTarget;
}

export interface SpecSteeringItemProjection {
  readonly id: string;
  readonly title: string;
  readonly key?: string;
  readonly pullRequests?: readonly { readonly number: number; readonly url: string }[];
  readonly tags?: readonly string[];
  readonly updatedAt: string;
  readonly progress: { readonly completed: number; readonly total: number };
  readonly signals: readonly SpecSteeringSignal[];
  readonly currentExecutions: readonly {
    readonly sessionId: string;
    readonly agentRole: string;
    readonly taskIds: readonly string[];
  }[];
  readonly steeringAvailable?: boolean;
}

export interface SpecRowSelection {
  readonly selected: boolean;
  readonly onSelectedChange: (selected: boolean) => void;
}

export interface SpecsOverviewProjection {
  readonly revision: string;
  readonly collection: SpecsCollection;
  readonly items: readonly SpecSteeringItemProjection[];
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
