import { createHash } from 'node:crypto';
import {
  readCanonicalSpecSources,
  type CanonicalSpecSource,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { SpecsReadError } from '../../read/error';
import { manifestOverviewFacts } from './manifest-facts';
import type { ArchivedSpecRecord, CurrentSpecRecord, SpecOverviewRecord } from './model';
import type { SpecsOverviewRepository } from './read-repository';

/**
 * Live Overview projection of Engine-verified canonical manifests.
 * Never reads generated indexes, primary fallbacks or demonstration records.
 */
export function createEngineSpecsOverviewRepository(
  engine: SpecFlowEngine,
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
    const projected = available.map(project);
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

function project(item: Extract<CanonicalSpecSource, { status: 'available' }>) {
  const spec = item.specification;
  const facts = manifestOverviewFacts(spec);
  const common: SpecOverviewRecord = {
    id: item.specId,
    title: spec.title,
    // The key Create gave it; a Specification created before keys has none (shown as absent).
    ...(spec.key !== undefined ? { key: spec.key } : {}),
    updatedAt: item.sourceUpdatedAt,
    progress: facts.progress,
  };
  const current: CurrentSpecRecord = {
    ...common,
    status: facts.status,
    readyForWork: facts.readyForWork,
    // No execution or attention can belong to a Specification in project mode: a managed Session is
    // created without any Specification or Task association (the Sessions contract refuses one) and
    // project mode composes no Session reference owner. The empty lists are that answer, not a guess;
    // they become real evidence once Sessions can be bound to a Specification.
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
