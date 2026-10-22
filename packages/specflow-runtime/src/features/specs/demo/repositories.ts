import type { SpecificationReadModel } from '../workspace/repository';
import { createSampleSpecsOverviewRepository } from '../overview/repository/sample-repository';
import type { SpecsOverviewRepository } from '../overview/repository/read-repository';
import type { CurrentSpecRecord, ArchivedSpecRecord } from '../overview/repository/model';
import type { SpecificationWorkspaceRepository } from '../workspace/repository';
import { buildDemoTaskContribution } from '../../tasks';
import { createDemoSessions, type DemoSessions } from '../../sessions';
import { createDemoDocuments, type DemoDocuments } from '../../documents';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import { createDemoState, type DemoState } from '../../../demo/state';

type DemoSpec = DemoSpecification;

function normalizeDemoSpec(record: CurrentSpecRecord | ArchivedSpecRecord): DemoSpec {
  return {
    id: record.id,
    ...(record.key ? { key: record.key } : {}),
    title: record.title,
    progress: record.progress ?? { completed: 0, total: 0 },
    ...('currentExecutions' in record
      ? {
          readyForWork: record.readyForWork ?? false,
          currentExecutions: record.currentExecutions ?? [],
          signals: record.signals ?? [],
        }
      : {}),
  };
}

function isCurrent(record: DemoSpec): boolean {
  return record.currentExecutions !== undefined;
}

function buildSpecification(record: DemoSpec): SpecificationReadModel {
  const attention = isCurrent(record)
    ? (record.signals ?? []).flatMap((signal) =>
        signal.kind === 'attention' && signal.target.kind === 'specification'
          ? [
              {
                id: signal.id,
                kind: 'specification' as const,
                title: signal.label,
                reason: signal.reason ?? signal.label,
                priority:
                  signal.attentionReason === 'input' ? ('high' as const) : ('normal' as const),
              },
            ]
          : [],
      )
    : [];
  return {
    revision: 'demo-workspace-1',
    specification: {
      id: record.id,
      ...(record.key ? { key: record.key } : {}),
      title: record.title,
      summary: record.title,
      preparationState:
        record.progress.total === 0
          ? 'empty'
          : isCurrent(record) && !record.readyForWork
            ? 'preparing'
            : 'prepared',
      attention,
    },
    sections: {
      activity: { state: 'available', data: { items: [] } },
      repository: { state: 'unavailable', reason: 'not_implemented' },
      changes: { state: 'unavailable', reason: 'not_implemented' },
    },
    actions: {
      executeTasks: { available: false, reason: 'not_implemented' },
      startSession: { available: false, reason: 'not_implemented' },
    },
  };
}

/** The demo environment parts the read side needs; each section is delegated to its owner module. */
export interface DemoSpecsRepositoriesDeps {
  readonly state: DemoState;
  readonly documents: Pick<DemoDocuments, 'contribution'>;
  readonly sessions: Pick<DemoSessions, 'contribution'>;
}

export function createDemoSpecsRepositories(deps?: DemoSpecsRepositoriesDeps): {
  overviewRepository: SpecsOverviewRepository;
  workspaceRepository: SpecificationWorkspaceRepository;
  catalogue: DemoCatalogue;
  contributions: import('../workspace/repository').WorkspaceContributions;
} {
  const state = deps?.state;
  // Without an environment the read side serves the seeded catalogue only (empty state).
  const empty = deps ? undefined : createDemoState();
  const documents = deps?.documents ?? createDemoDocuments(empty!);
  const sessions = deps?.sessions ?? createDemoSessions(empty!);
  const seeded = createSampleSpecsOverviewRepository();
  const overviewRepository: SpecsOverviewRepository = {
    async readCurrent() {
      const snapshot = await seeded.readCurrent();
      const created = state?.specifications.size ?? 0;
      return {
        // The seeded revision is kept as is until something is created, so the packaged Runtime
        // contract stays stable; every created specification then advances the revision.
        revision: created ? snapshot.revision + '-' + created : snapshot.revision,
        items: [...(state?.specifications.values() ?? [])]
          .map((item) => item.record)
          .concat([...snapshot.items]),
      };
    },
    readArchive: () => seeded.readArchive(),
  };

  async function find(specId: string): Promise<DemoSpec | undefined> {
    const [current, archive] = await Promise.all([
      overviewRepository.readCurrent(),
      overviewRepository.readArchive(),
    ]);
    const record = [...current.items, ...archive.items].find((spec) => spec.id === specId);
    return record ? normalizeDemoSpec(record) : undefined;
  }

  return {
    overviewRepository,
    workspaceRepository: {
      async readSpecification(specId) {
        const record = await find(specId);
        if (!record) return null;
        const specification = buildSpecification(record);
        const created = state?.specifications.get(specId);
        return {
          ...specification,
          specification: {
            ...specification.specification,
            preparationState: created
              ? created.documents.size
                ? 'preparing'
                : 'empty'
              : specification.specification.preparationState,
          },
          actions: { ...specification.actions, startSession: { available: !!state } },
        };
      },
    },
    contributions: {
      async tasks(specId) {
        const record = await find(specId);
        return record
          ? buildDemoTaskContribution(record)
          : { state: 'unavailable', reason: 'source_unavailable' };
      },
      async documents(specId) {
        return documents.contribution(specId, find);
      },
      async sessions(specId) {
        return sessions.contribution(specId, find);
      },
    },
    catalogue: {
      find,
      async all() {
        const [current, archive] = await Promise.all([
          overviewRepository.readCurrent(),
          overviewRepository.readArchive(),
        ]);
        return [...current.items, ...archive.items].map(normalizeDemoSpec);
      },
    },
  };
}
