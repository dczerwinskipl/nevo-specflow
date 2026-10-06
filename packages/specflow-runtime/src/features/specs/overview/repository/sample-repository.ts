import type {
  ArchivedSpecRecord,
  CurrentSpecRecord,
  CurrentSpecSignalRecord,
  CurrentSpecTargetRecord,
} from './model';
import type { SpecsOverviewRepository } from './read-repository';

const specTarget = (specId: string): CurrentSpecTargetRecord => ({
  kind: 'specification',
  specId,
});

function signal(
  specId: string,
  id: string,
  kind: CurrentSpecSignalRecord['kind'],
  label: string,
  priority: number,
  target: CurrentSpecTargetRecord = specTarget(specId),
  reason?: string,
  attentionReason?: CurrentSpecSignalRecord['attentionReason'],
  count?: number,
): CurrentSpecSignalRecord {
  return {
    id,
    kind,
    label,
    priority,
    target,
    ...(reason ? { reason } : {}),
    ...(attentionReason ? { attentionReason } : {}),
    ...(count ? { count } : {}),
  };
}

const currentItems: readonly CurrentSpecRecord[] = [
  {
    id: 'admission',
    readyForWork: true,
    key: 'UI-1234',
    title: 'Deterministic admission and execution boundaries',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Auth'],
    progress: { completed: 5, total: 9 },
    signals: [
      signal(
        'admission',
        'input',
        'attention',
        'Agent asks for input',
        110,
        { kind: 'session', specId: 'admission', sessionId: 'sample-session-23' },
        'Choose how queued work should behave after a recovery.',
        'input',
      ),
    ],
    currentExecutions: [
      { sessionId: 'sample-session-24', agentRole: 'Implementer', taskIds: ['TASK-02'] },
    ],
  },
  {
    id: 'security',
    readyForWork: true,
    key: 'RT-1235',
    title: 'Runtime authorization and access policy',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Runtime'],
    progress: { completed: 3, total: 7 },
    signals: [
      signal(
        'security',
        'decision',
        'attention',
        'Owner decision required',
        100,
        specTarget('security'),
        undefined,
        'decision',
      ),
    ],
    currentExecutions: [],
  },
  {
    id: 'review',
    readyForWork: true,
    key: 'CORE-1236',
    title: 'Review evidence and verification handover',
    updatedAt: '2026-10-01T12:00:00Z',
    progress: { completed: 6, total: 10 },
    signals: [
      signal(
        'review',
        'review',
        'attention',
        '3 Tasks require review',
        95,
        specTarget('review'),
        undefined,
        'review',
        3,
      ),
    ],
    currentExecutions: [],
  },
  {
    id: 'packaging',
    readyForWork: true,
    key: 'CORE-1237',
    title: 'Single-artifact packaging and installation',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Core'],
    progress: { completed: 4, total: 6 },
    signals: [signal('packaging', 'ready', 'ready', '2 Tasks ready to start', 60)],
    currentExecutions: [],
  },
  {
    id: 'providers',
    readyForWork: true,
    key: 'RT-104',
    title: 'Provider diagnostics and replay',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Provider'],
    progress: { completed: 2, total: 8 },
    signals: [signal('providers', 'working', 'working', 'Implementation in progress', 40)],
    currentExecutions: [
      {
        sessionId: 'sample-session-42',
        agentRole: 'Implementer',
        taskIds: ['TASK-02', 'TASK-04', 'TASK-05'],
      },
    ],
  },
  {
    id: 'localization',
    readyForWork: false,
    key: 'UI-1238',
    title: 'Localization and account preferences',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['UI'],
    progress: { completed: 0, total: 5 },
    signals: [],
    currentExecutions: [],
  },
];

const archivedItems: readonly ArchivedSpecRecord[] = [
  {
    id: 'archived-shell',
    completedAt: '2026-09-27T12:00:00Z',
    archivedAt: '2026-09-28T12:00:00Z',
    key: 'UI-1200',
    title: 'Responsive application shell and workspace navigation',
    updatedAt: '2026-09-28T12:00:00Z',
    progress: { completed: 8, total: 8 },
  },
];

export function createSampleSpecsOverviewRepository(): SpecsOverviewRepository {
  return {
    readCurrent() {
      return Promise.resolve({
        revision: 'backend-sample-current-1',
        items: currentItems,
      });
    },

    readArchive() {
      return Promise.resolve({
        revision: 'backend-sample-archive-1',
        items: archivedItems,
      });
    },
  };
}
