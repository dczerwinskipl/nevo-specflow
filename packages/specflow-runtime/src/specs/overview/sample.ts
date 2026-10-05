import type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecsOverviewGroup,
  SpecSteeringItemProjection,
  CurrentSpecsOverviewProjection,
  ArchiveSpecsOverviewProjection,
} from '@nevo/specflow-contracts/specs-overview';
import { overviewGroups } from './groups';

// These scopes describe only the deterministic preview catalogue, not repository Specs.
export const SAMPLE_PROJECT_ID = 'specflow-preview';

export function sampleSpecsOverview(
  collection: 'active',
  configuredGroups?: readonly SpecsOverviewGroup[],
): CurrentSpecsOverviewProjection;
export function sampleSpecsOverview(
  collection: 'archive',
  configuredGroups?: readonly SpecsOverviewGroup[],
): ArchiveSpecsOverviewProjection;
export function sampleSpecsOverview(
  collection: SpecsCollection,
  configuredGroups?: readonly SpecsOverviewGroup[],
): SpecsOverviewProjection;
export function sampleSpecsOverview(
  collection: SpecsCollection,
  configuredGroups?: readonly SpecsOverviewGroup[],
): SpecsOverviewProjection {
  if (collection === 'archive')
    return {
      revision: 'backend-sample-archive-1',
      collection,
      groups: [],
      sample: true,
      items: [
        {
          id: 'archived-shell',
          completedAt: '2026-09-27T12:00:00Z',
          archivedAt: '2026-09-28T12:00:00Z',
          key: 'UI-1200',
          title: 'Responsive application shell and workspace navigation',
          updatedAt: '2026-09-28T12:00:00Z',
          progress: { completed: 8, total: 8 },
        },
      ],
    };
  const groups = overviewGroups(configuredGroups);
  // Preclassified mock data, not a production lifecycle/group derivation engine.
  const items: SpecSteeringItemProjection[] = [
    {
      id: 'admission',
      groupId: 'requires-attention',
      overviewSummary: { kind: 'attention', reason: 'input' },
      concurrentWork: { executionCount: 1 },
      key: 'UI-1234',
      title: 'Deterministic admission and execution boundaries',
      updatedAt: '2026-10-01T12:00:00Z',
      tags: ['Auth'],
      progress: { completed: 5, total: 9 },
      signals: [
        {
          id: 'input',
          kind: 'attention',
          label: 'Agent asks for input',
          attentionReason: 'input',
          priority: 110,
          reason: 'Choose how queued work should behave after a recovery.',
          target: { kind: 'session', specId: 'admission', sessionId: 'sample-session-23' },
        },
      ],
      currentExecutions: [
        { sessionId: 'sample-session-24', agentRole: 'Implementer', taskIds: ['TASK-02'] },
      ],
    },
    {
      id: 'security',
      groupId: 'requires-attention',
      overviewSummary: { kind: 'attention', reason: 'decision' },
      key: 'RT-1235',
      title: 'Runtime authorization and project access policy',
      updatedAt: '2026-10-01T12:00:00Z',
      tags: ['Runtime'],
      progress: { completed: 3, total: 7 },
      signals: [
        {
          id: 'decision',
          kind: 'attention',
          label: 'Owner decision required',
          attentionReason: 'decision',
          priority: 100,
          target: { kind: 'specification', specId: 'security' },
        },
      ],
      currentExecutions: [],
    },
    {
      id: 'review',
      groupId: 'requires-attention',
      overviewSummary: { kind: 'attention', reason: 'review', count: 3 },
      key: 'CORE-1236',
      title: 'Review evidence and verification handover',
      updatedAt: '2026-10-01T12:00:00Z',
      progress: { completed: 6, total: 10 },
      signals: [
        {
          id: 'review',
          kind: 'attention',
          label: '3 Tasks require review',
          attentionReason: 'review',
          priority: 95,
          target: { kind: 'specification', specId: 'review' },
        },
      ],
      currentExecutions: [],
    },
    {
      id: 'packaging',
      groupId: 'ready',
      overviewSummary: { kind: 'ready' },
      key: 'CORE-1237',
      title: 'Single-artifact packaging and installation',
      updatedAt: '2026-10-01T12:00:00Z',
      tags: ['Core'],
      progress: { completed: 4, total: 6 },
      signals: [
        {
          id: 'ready',
          kind: 'ready',
          label: '2 Tasks ready to start',
          priority: 60,
          target: { kind: 'specification', specId: 'packaging' },
        },
      ],
      currentExecutions: [],
    },
    {
      id: 'providers',
      groupId: 'active',
      overviewSummary: { kind: 'active', executionCount: 1 },
      key: 'RT-104',
      title: 'Provider diagnostics and replay',
      updatedAt: '2026-10-01T12:00:00Z',
      tags: ['Provider'],
      progress: { completed: 2, total: 8 },
      signals: [
        {
          id: 'working',
          kind: 'working',
          label: 'Implementation in progress',
          priority: 40,
          target: { kind: 'specification', specId: 'providers' },
        },
      ],
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
      groupId: 'draft',
      overviewSummary: { kind: 'draft' },
      key: 'UI-1238',
      title: 'Localization and account preferences',
      updatedAt: '2026-10-01T12:00:00Z',
      tags: ['UI'],
      progress: { completed: 0, total: 5 },
      signals: [],
      currentExecutions: [],
    },
  ];
  return {
    revision: `backend-sample-${collection}-1`,
    collection,
    groups,
    sample: true,
    items: items.filter((item) => groups.some((group) => group.id === item.groupId)),
  };
}
