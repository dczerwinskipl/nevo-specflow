import type { SpecificationReadModel } from '../workspace/repository';
import { createSampleSpecsOverviewRepository } from '../overview/repository/sample-repository';
import type { SpecsOverviewRepository } from '../overview/repository/read-repository';
import type { CurrentSpecRecord, ArchivedSpecRecord } from '../overview/repository/model';
import type { SpecificationWorkspaceRepository } from '../workspace/repository';
import { buildDemoTaskContribution } from '../../tasks';
import { buildDemoSessionContribution } from '../../sessions';
import { buildDemoDocumentManifest } from '../../documents';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';

type DemoSpec = DemoSpecification;

function normalizeDemoSpec(record: CurrentSpecRecord | ArchivedSpecRecord): DemoSpec {
  return {
    id: record.id,
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

export function createDemoSpecsRepositories(): {
  overviewRepository: SpecsOverviewRepository;
  workspaceRepository: SpecificationWorkspaceRepository;
  catalogue: DemoCatalogue;
  contributions: import('../workspace/repository').WorkspaceContributions;
} {
  const overviewRepository = createSampleSpecsOverviewRepository();

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
        return buildSpecification(record);
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
        const record = await find(specId);
        return record
          ? { state: 'available', data: { items: buildDemoDocumentManifest(record) } }
          : { state: 'unavailable', reason: 'source_unavailable' };
      },
      async sessions(specId) {
        const record = await find(specId);
        if (!record) return { section: { state: 'unavailable', reason: 'source_unavailable' } };
        return buildDemoSessionContribution(record);
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
