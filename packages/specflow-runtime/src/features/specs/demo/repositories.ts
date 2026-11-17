import type {
  SpecificationReadModel,
  SpecificationWorkspaceRepository,
  WorkspaceContributions,
} from '../workspace/repository';
import { createSampleSpecsOverviewRepository } from '../overview/repository/sample-repository';
import type { SpecsOverviewRepository } from '../overview/repository/read-repository';
import type { CurrentSpecRecord, ArchivedSpecRecord } from '../overview/repository/model';
import type { OverviewTaskProgress } from '../overview/repository/engine-repository';
import { createDemoSessions, type DemoSessions } from '../../sessions';
import { createDemoDocuments, type DemoDocuments } from '../../documents';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import { seededSpecWorkspace } from './seed';
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
  return {
    // Seeded Specifications are bound by the seed; created ones override it with their own.
    revision: 'demo-workspace-1',
    workspaceId: seededSpecWorkspace(record.id),
    specification: {
      id: record.id,
      ...(record.key ? { key: record.key } : {}),
      title: record.title,
      summary: record.title,
      // The Tasks contribution replaces it with the state the Tasks imply, as in a project.
      preparationState:
        record.progress.total === 0
          ? 'empty'
          : isCurrent(record) && !record.readyForWork
            ? 'preparing'
            : 'prepared',
      // As in a project, what needs a person is the workflow's attention (the Tasks section).
      attention: [],
    },
    sections: {
      repository: { state: 'unavailable', reason: 'not_implemented' },
      changes: { state: 'unavailable', reason: 'not_implemented' },
    },
    actions: {
      startSession: { available: false, reason: 'not_implemented' },
    },
  };
}

/** The demo environment parts the read side needs; each section is delegated to its owner module. */
export interface DemoSpecsRepositoriesDeps {
  readonly state: DemoState;
  readonly documents: Pick<DemoDocuments, 'contribution'>;
  readonly sessions: Pick<DemoSessions, 'contribution'>;
  /**
   * The Tasks owner over the demo workflow: the workspace `tasks` section and the Specs Overview
   * progress, as the Engine projects them in a project. Without it there are no Tasks.
   */
  readonly tasks?: {
    readonly section: NonNullable<WorkspaceContributions['tasks']>;
    readonly progress: OverviewTaskProgress;
  };
}

export function createDemoSpecsRepositories(deps?: DemoSpecsRepositoriesDeps): {
  overviewRepository: SpecsOverviewRepository;
  workspaceRepository: SpecificationWorkspaceRepository;
  catalogue: DemoCatalogue;
  contributions: WorkspaceContributions;
} {
  const state = deps?.state;
  // Without an environment the read side serves the seeded catalogue only (empty state).
  const empty = deps ? undefined : createDemoState();
  const documents = deps?.documents ?? createDemoDocuments(empty!);
  const sessions = deps?.sessions ?? createDemoSessions(empty!);
  const seeded = createSampleSpecsOverviewRepository();
  // The catalogue records as seeded and created; the Overview's progress is the Tasks owner's.
  const records: SpecsOverviewRepository = {
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
  const tasks = deps?.tasks;
  const overviewRepository: SpecsOverviewRepository = {
    async readCurrent() {
      const current = await records.readCurrent();
      if (!tasks) {
        return current;
      }

      const progress = await tasks.progress(current.items.map((item) => item.id));

      return {
        ...current,
        items: current.items.map((item) => {
          const counted = progress.get(item.id);

          return counted ? { ...item, progress: counted } : item;
        }),
      };
    },
    readArchive: () => records.readArchive(),
  };

  async function find(specId: string): Promise<DemoSpec | undefined> {
    const [current, archive] = await Promise.all([records.readCurrent(), records.readArchive()]);
    const record = [...current.items, ...archive.items].find((spec) => spec.id === specId);

    return record ? normalizeDemoSpec(record) : undefined;
  }

  return {
    overviewRepository,
    workspaceRepository: {
      async readSpecification(specId) {
        const record = await find(specId);
        if (!record) {
          return null;
        }

        const specification = buildSpecification(record);
        const created = state?.specifications.get(specId);

        return {
          ...specification,
          ...(created ? { workspaceId: created.workspaceId } : {}),
          specification: {
            ...specification.specification,
            preparationState: created
              ? created.documents.files.size
                ? 'preparing'
                : 'empty'
              : specification.specification.preparationState,
          },
          actions: {
            ...specification.actions,
            startSession: {
              available: !!state,
              // The demo starts Sessions at its own route; it has no composed create.
              path: '/api/demo/specs/' + encodeURIComponent(specId) + '/sessions',
            },
          },
        };
      },
    },
    contributions: {
      ...(tasks ? { tasks: tasks.section } : {}),
      async documents(specId) {
        return documents.contribution(specId, find);
      },
      async sessions(specId) {
        return sessions.contribution(specId, find);
      },
      // The demo has no activity source: an empty success, unchanged (owner decision D5).
      activity: () => Promise.resolve({ state: 'available', data: { items: [] } }),
    },
    catalogue: {
      find,
      async all() {
        const [current, archive] = await Promise.all([
          records.readCurrent(),
          records.readArchive(),
        ]);

        return [...current.items, ...archive.items].map(normalizeDemoSpec);
      },
    },
  };
}
