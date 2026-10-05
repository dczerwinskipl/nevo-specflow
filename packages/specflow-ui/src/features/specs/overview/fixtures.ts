import type {
  SpecSteeringItemProjection,
  SpecArchiveItemProjection,
  CurrentSpecsOverviewProjection,
  ArchiveSpecsOverviewProjection,
  SpecSteeringSignal,
  SpecsCollection,
  SpecsOverviewProjection,
  SteeringKind,
  SteeringTarget,
} from './model';

const specTarget = (specId: string): SteeringTarget => ({ kind: 'specification', specId });
function signal(
  specId: string,
  id: string,
  kind: SteeringKind,
  label: string,
  priority: number,
  target: SteeringTarget = specTarget(specId),
  reason?: string,
  attentionReason?: SpecSteeringSignal['attentionReason'],
): SpecSteeringSignal {
  return { id, kind, label, priority, target, reason, attentionReason };
}
export function createSpecItem(
  overrides: Partial<SpecSteeringItemProjection> = {},
): SpecSteeringItemProjection {
  return {
    id: 'admission',
    title: 'Deterministic admission and execution boundaries',
    groupId: 'draft',
    overviewSummary: { kind: 'draft' },
    updatedAt: '2026-10-01T12:00:00Z',
    progress: { completed: 5, total: 9 },
    signals: [],
    currentExecutions: [],
    ...overrides,
  };
}
export function createArchiveItem(
  overrides: Partial<SpecArchiveItemProjection> = {},
): SpecArchiveItemProjection {
  return {
    id: 'archive-spec',
    title: 'Archived specification',
    updatedAt: '2026-10-01T12:00:00Z',
    progress: { completed: 5, total: 9 },
    ...overrides,
  };
}
export function createSpecsFixture(collection?: 'active'): CurrentSpecsOverviewProjection;
export function createSpecsFixture(collection: 'archive'): ArchiveSpecsOverviewProjection;
export function createSpecsFixture(collection: SpecsCollection): SpecsOverviewProjection;
export function createSpecsFixture(
  collection: SpecsCollection = 'active',
): SpecsOverviewProjection {
  if (collection === 'archive')
    return {
      revision: 'archive-fixture-1',
      collection,
      groups: [],
      items: Array.from({ length: 18 }, (_, index) =>
        createArchiveItem({
          id: `archive-${index}`,
          title:
            [
              'Canonical Session, Turn and Work model',
              'Repository authentication and trusted local access',
              'Responsive application shell and workspace navigation',
            ][index % 3] + (index > 2 ? ` — phase ${index + 1}` : ''),
          updatedAt: `2026-09-${String(28 - index).padStart(2, '0')}T12:00:00Z`,
          ...(index % 4 === 0
            ? { completedAt: '2026-09-22T14:00:00Z' }
            : index % 4 === 1
              ? { archivedAt: '2026-09-25T09:00:00Z' }
              : index % 4 === 2
                ? { completedAt: '2026-09-22T14:00:00Z', archivedAt: '2026-09-25T09:00:00Z' }
                : {}),
          progress: { completed: 8 + index, total: 8 + index },
        }),
      ),
    };
  return {
    revision: 'active-fixture-1',
    collection,
    groups: [
      { id: 'requires-attention', order: 10 },
      { id: 'active', order: 20 },
      { id: 'ready', order: 30 },
      { id: 'draft', order: 40 },
    ],
    items: [
      createSpecItem({
        key: 'UI-1234',
        groupId: 'requires-attention',
        overviewSummary: { kind: 'attention', reason: 'input' },
        concurrentWork: { executionCount: 1 },
        pullRequests: [{ number: 27, url: 'https://example.test/pull/27' }],
        tags: ['Auth'],
        signals: [
          signal(
            'admission',
            'input',
            'attention',
            'Agent asks for input',
            110,
            { kind: 'session', specId: 'admission', sessionId: 'session-23' },
            'Choose how queued work should behave after a recovery.',
            'input',
          ),
          signal('admission', 'review', 'attention', 'TASK-03 requires review', 100, {
            kind: 'task',
            specId: 'admission',
            taskId: 'TASK-03',
          }),
          signal('admission', 'ready', 'ready', 'TASK-05 ready to start', 60, {
            kind: 'task',
            specId: 'admission',
            taskId: 'TASK-05',
          }),
          signal('admission', 'working', 'working', 'Reviewer working', 40),
        ],
        currentExecutions: [
          { sessionId: 'session-23', agentRole: 'Reviewer', taskIds: ['TASK-02', 'TASK-03'] },
        ],
      }),
      createSpecItem({
        id: 'security',
        groupId: 'requires-attention',
        overviewSummary: { kind: 'attention', reason: 'decision' },
        key: 'RT-1235',
        tags: ['Runtime'],
        title: 'Runtime authorization and project access policy',
        progress: { completed: 3, total: 7 },
        signals: [
          signal(
            'security',
            'owner',
            'attention',
            'Owner decision required',
            100,
            specTarget('security'),
            'Confirm which project operations reviewers can access.',
            'decision',
          ),
        ],
      }),
      createSpecItem({
        id: 'review',
        groupId: 'requires-attention',
        overviewSummary: { kind: 'attention', reason: 'review', count: 3 },
        key: 'CORE-1236',
        title: 'Review evidence and verification handover',
        progress: { completed: 6, total: 10 },
        signals: [
          {
            ...signal('review', 'aggregate', 'attention', '3 Tasks require review', 95),
            attentionReason: 'review',
          },
        ],
      }),
      createSpecItem({
        id: 'packaging',
        groupId: 'ready',
        overviewSummary: { kind: 'ready' },
        key: 'CORE-1237',
        tags: ['Core'],
        title: 'Single-artifact packaging and installation',
        progress: { completed: 4, total: 6 },
        signals: [signal('packaging', 'ready', 'ready', '2 Tasks ready to start', 60)],
      }),
      createSpecItem({
        id: 'providers',
        groupId: 'active',
        overviewSummary: { kind: 'active', executionCount: 1 },
        key: 'RT-104',
        pullRequests: [{ number: 31, url: 'https://example.test/pull/31' }],
        tags: ['Provider'],
        title: 'Provider diagnostics and replay',
        progress: { completed: 2, total: 8 },
        signals: [signal('providers', 'batch', 'working', 'Implementation in progress', 40)],
        currentExecutions: [
          {
            sessionId: 'session-42',
            agentRole: 'Implementer',
            taskIds: ['TASK-02', 'TASK-04', 'TASK-05'],
          },
        ],
      }),
      createSpecItem({
        id: 'recovery',
        groupId: 'ready',
        overviewSummary: { kind: 'ready' },
        key: 'RT-105',
        tags: ['Provider'],
        title: 'Provider process recovery',
        progress: { completed: 1, total: 4 },
        signals: [
          signal(
            'recovery',
            'issue',
            'issue',
            'Agent remediation available',
            30,
            specTarget('recovery'),
            'The agent can retry the failed verification.',
          ),
        ],
      }),
      createSpecItem({
        id: 'localization',
        key: 'UI-1238',
        tags: ['UI'],
        title: 'Localization and account preferences',
        progress: { completed: 0, total: 5 },
        signals: [signal('localization', 'quiet', 'quiet', 'No immediate action', 10)],
      }),
    ],
  };
}

export function createLongContentFixture(): CurrentSpecsOverviewProjection {
  const base = createSpecsFixture();
  return {
    ...base,
    items: [
      createSpecItem({
        ...base.items[0],
        title:
          'Deterministic execution admission, crash recovery and cross-provider ownership reconciliation for distributed repository workspaces',
        overviewSummary: { kind: 'attention', reason: 'decision' },
        signals: [
          signal(
            'admission',
            'long',
            'attention',
            'TASK-03 requires an owner decision about recovery after a provider disconnects during verification',
            110,
            { kind: 'task', specId: 'admission', taskId: 'TASK-03' },
            'Confirm whether verification should continue in the existing worktree or resume after the upstream repository changes have been reconciled.',
            'decision',
          ),
          ...base.items[0]!.signals,
        ],
      }),
      ...base.items.slice(1),
    ],
  };
}
