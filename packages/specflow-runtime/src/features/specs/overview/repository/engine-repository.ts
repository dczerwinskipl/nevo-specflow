import { createHash } from 'node:crypto';
import {
  readCanonicalSpecSources,
  type CanonicalSpecSource,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { SpecsReadError } from '../../read/error';
import { manifestOverviewFacts } from './manifest-facts';
import type {
  ArchivedSpecRecord,
  CurrentSpecRecord,
  SpecOverviewRecord,
  SpecProgressRecord,
} from './model';
import type { SpecsOverviewRepository } from './read-repository';

/**
 * The progress of each listed Specification from the Tasks owner (the Engine's Task resources and
 * runs); `null` for a Specification whose Tasks cannot be read.
 */
export type OverviewTaskProgress = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, SpecProgressRecord | null>>;

/**
 * Live Overview projection of Engine-verified canonical manifests, with the progress the Tasks
 * owner reports. Never reads generated indexes, primary fallbacks or demonstration records.
 */
export function createEngineSpecsOverviewRepository(
  engine: SpecFlowEngine,
  taskProgress?: OverviewTaskProgress,
): SpecsOverviewRepository {
  async function read(isVisibleSpec?: (specId: string) => boolean) {
    const discovered = await readCanonicalSpecSources(engine, isVisibleSpec);
    // The existing Overview DTO cannot represent unavailable canonical rows.
    // Fail closed with typed 503 instead of silently losing a bound Spec.
    for (const item of discovered) {
      if (item.status === 'workspace_unavailable') {
        throw new SpecsReadError(
          'SPEC_WORKSPACE_UNAVAILABLE',
          'A canonical specification workspace is unavailable.',
        );
      }

      if (item.status === 'manifest_missing') {
        throw new SpecsReadError(
          'SPEC_MANIFEST_MISSING',
          'A bound canonical specification manifest is missing.',
        );
      }
    }

    const available = discovered.filter(
      (item): item is Extract<CanonicalSpecSource, { status: 'available' }> =>
        item.status === 'available',
    );
    const progress: ReadonlyMap<string, SpecProgressRecord | null> =
      (await taskProgress?.(available.map((item) => item.specId))) ?? new Map();
    const projected = available.map((item) => project(item, progress.get(item.specId) ?? null));
    const revision = createHash('sha256').update(JSON.stringify(projected)).digest('hex');

    return { revision, items: projected };
  }

  return {
    async readCurrent(isVisibleSpec) {
      const snapshot = await read(isVisibleSpec);

      return {
        revision: snapshot.revision,
        items: snapshot.items
          .filter((item) => item.location === 'active')
          .map((item) => item.current),
      };
    },
    async readArchive(isVisibleSpec) {
      const snapshot = await read(isVisibleSpec);

      return {
        revision: snapshot.revision,
        items: snapshot.items
          .filter((item) => item.location === 'archive')
          .map((item) => item.archive),
      };
    },
  };
}

function project(
  item: Extract<CanonicalSpecSource, { status: 'available' }>,
  progress: SpecProgressRecord | null,
) {
  const spec = item.specification;
  const facts = manifestOverviewFacts();
  const common: SpecOverviewRecord = {
    id: item.specId,
    title: spec.title,
    // The key Create gave it; a Specification created before keys has none (shown as absent).
    ...(spec.key !== undefined ? { key: spec.key } : {}),
    updatedAt: item.sourceUpdatedAt,
    progress,
  };
  const current: CurrentSpecRecord = {
    ...common,
    status: facts.status,
    readyForWork: facts.readyForWork,
    // A project-mode Session can be associated with a Specification (and its Tasks), but an
    // association is not an execution: it says what the Session is about, not that it runs a step
    // of this Specification, and it carries no attention. So neither list is derived from
    // associations; both stay empty until project mode has an execution evidence owner.
    signals: [],
    currentExecutions: [],
  };
  const archive: ArchivedSpecRecord = common;

  return {
    location: spec.location,
    current,
    archive,
    // Canonical metadata changes must change revision even if DTO projection
    // cannot yet represent that property (e.g. status or priority).
    evidence: {
      ...spec,
      workspaceId: item.workspaceId,
      binding: item.binding,
      sourceRevision: item.sourceRevision,
    },
  };
}
