import { createHash } from 'node:crypto';
import {
  readCanonicalSpecSources,
  type CanonicalSpecSource,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { SpecsReadError } from '../../read/error';
import type {
  ArchivedSpecRecord,
  CurrentSpecAttentionRecord,
  CurrentSpecRecord,
  CurrentSpecUnreadableReason,
  CurrentSpecSignalRecord,
  CurrentSpecWorkflowRecord,
  SpecOverviewRecord,
  SpecProgressRecord,
} from './model';
import type { SpecsOverviewRepository } from './read-repository';

/**
 * What the Specs list shows of one Specification's execution, one Engine read of it: the Task
 * progress, where its workflow run stands, how many attention items it has (the Overview's
 * Requires attention) and the first of them, as the Overview lists it.
 */
export interface OverviewExecutionRecord {
  readonly progress: SpecProgressRecord;
  readonly workflow: CurrentSpecWorkflowRecord;
  readonly attention: number;
  readonly firstAttention?: CurrentSpecAttentionRecord;
}

/** One Specification's execution as the list reads it, or why it could not be read. */
export type OverviewExecutionRead =
  | ({ readonly kind: 'read' } & OverviewExecutionRecord)
  | { readonly kind: 'unreadable'; readonly reason: CurrentSpecUnreadableReason };

/**
 * The execution of each listed Specification from the workflow owner (the Engine's runs and Task
 * resources), or why it could not be read.
 */
export type OverviewExecution = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, OverviewExecutionRead>>;

/**
 * The workflow's attention items as one attention signal on the Specification: the list classifies
 * and counts them; their reasons and actions are the Overview's.
 */
export function workflowAttentionSignal(
  specId: string,
  count: number,
): CurrentSpecSignalRecord | undefined {
  return count > 0
    ? {
        id: 'workflow-attention',
        kind: 'attention',
        label: 'Requires attention',
        count,
        priority: 0,
        target: { kind: 'specification', specId },
      }
    : undefined;
}

/**
 * Live Overview projection of Engine-verified canonical manifests, with the execution the workflow
 * owner reports. Never reads generated indexes, primary fallbacks or demonstration records.
 */
export function createEngineSpecsOverviewRepository(
  engine: SpecFlowEngine,
  execution?: OverviewExecution,
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
    const executions: ReadonlyMap<string, OverviewExecutionRead> =
      (await execution?.(available.map((item) => item.specId))) ?? new Map();
    const projected = available.map((item) => project(item, executions.get(item.specId)));
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
  read: OverviewExecutionRead | undefined,
) {
  const spec = item.specification;
  const execution = read?.kind === 'read' ? read : null;
  const attention = execution
    ? workflowAttentionSignal(item.specId, execution.attention)
    : undefined;
  const common: SpecOverviewRecord = {
    id: item.specId,
    title: spec.title,
    // The key Create gave it; a Specification created before keys has none (shown as absent).
    ...(spec.key !== undefined ? { key: spec.key } : {}),
    updatedAt: item.sourceUpdatedAt,
    progress: execution?.progress ?? null,
  };
  const current: CurrentSpecRecord = {
    ...common,
    // Where the workflow run stands (the manifest has no status).
    workflow: execution?.workflow ?? null,
    ...(execution?.firstAttention ? { attention: execution.firstAttention } : {}),
    // The row says it could not read the workflow, and why.
    ...(read?.kind === 'unreadable' ? { unreadable: { reason: read.reason } } : {}),
    // A project-mode Session can be associated with a Specification (and its Tasks), but an
    // association is not an execution: it says what the Session is about, not that it runs a step
    // of this Specification, and it carries no attention. So neither list is derived from
    // associations; the only signal is the workflow's own attention.
    signals: execution ? (attention ? [attention] : []) : null,
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
