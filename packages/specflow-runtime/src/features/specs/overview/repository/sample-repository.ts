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
    // The demo's workflow (run in memory) says where it stands; this sample does not know.
    workflow: null,
    key: 'UI-1234',
    title: 'Deterministic admission and execution boundaries',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Auth'],
    progress: { completed: 1, total: 5 },
    signals: [
      signal(
        'admission',
        'input',
        'attention',
        'Agent asks for input',
        110,
        { kind: 'session', specId: 'admission', sessionId: '00000000-0000-4000-8000-000000000023' },
        'Choose how queued work should behave after a recovery.',
        'input',
      ),
    ],
    currentExecutions: [
      {
        sessionId: '00000000-0000-4000-8000-000000000024',
        agentRole: 'Implementer',
        taskIds: ['queue-validation'],
      },
    ],
  },
  {
    id: 'security',
    // The demo's workflow (run in memory) says where it stands; this sample does not know.
    workflow: null,
    key: 'RT-1235',
    title: 'Runtime authorization and access policy',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Runtime'],
    progress: { completed: 0, total: 2 },
    signals: [],
    currentExecutions: [],
  },
  {
    id: 'review',
    // The demo's workflow (run in memory) says where it stands; this sample does not know.
    workflow: null,
    key: 'CORE-1236',
    title: 'Review evidence and verification handover',
    updatedAt: '2026-10-01T12:00:00Z',
    progress: { completed: 1, total: 4 },
    signals: [],
    currentExecutions: [],
  },
  {
    id: 'packaging',
    // The demo's workflow (run in memory) says where it stands; this sample does not know.
    workflow: null,
    key: 'CORE-1237',
    title: 'Single-artifact packaging and installation',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Core'],
    progress: { completed: 2, total: 4 },
    signals: [],
    currentExecutions: [],
  },
  {
    id: 'providers',
    // The demo's workflow (run in memory) says where it stands; this sample does not know.
    workflow: null,
    key: 'RT-104',
    title: 'Provider diagnostics and replay',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['Provider'],
    progress: { completed: 1, total: 5 },
    signals: [],
    currentExecutions: [
      {
        sessionId: '00000000-0000-4000-8000-000000000042',
        agentRole: 'Implementer',
        taskIds: ['replay-runner'],
      },
    ],
  },
  {
    id: 'localization',
    workflow: { kind: 'not-started' },
    key: 'UI-1238',
    title: 'Localization and account preferences',
    updatedAt: '2026-10-01T12:00:00Z',
    tags: ['UI'],
    progress: { completed: 0, total: 0 },
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
