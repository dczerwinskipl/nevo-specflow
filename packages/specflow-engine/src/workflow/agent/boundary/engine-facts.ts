import { dirname, isAbsolute, relative, sep } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { readWorkspaceRegistry } from '../../../project/workspace/registry/registry';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../../specs/documents/changes/journal/kind';
import { DOCUMENT_CHANGE_STAGE_FACTS } from '../../../specs/documents/changes/journal/stages';
import { decodePlanWithEvidence } from '../../../specs/documents/changes/plan/codec';
import { listDocumentChangeJournals } from '../../../specs/documents/write/journal-store';
import { listLedgerRecords, readPayload } from '../../../specs/durable';
import { listUncleanPaths } from '../../../specs/lifecycle/preflight';
import { SPECIFICATION_ROOT } from '../../../specs/repository';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import type { AttributionFacts, EngineWriteFact } from './attribution';
import { attributionFactsOf, type AttributionLayout, type EngineWrites } from './facts';

/** A path below `from` as a checkout-relative POSIX path; `undefined` when it is not below it. */
function inside(from: string, path: string): string | undefined {
  const value = relative(from, path);
  if (value === '' || value.startsWith('..') || isAbsolute(value)) {
    return undefined;
  }

  return value.split(sep).join('/');
}

/**
 * The layout of a checkout: the Specification root, and the Engine's namespaces derived from the
 * Project Home (the folder of its project configuration, `.nevo` today; and the local state root
 * when it lies inside this checkout, which Git ignores anyway).
 */
function layoutOf(engine: SpecFlowEngine, root: string): AttributionLayout {
  const { project } = engine.context;
  const namespaces = [
    inside(project.homeRoot, dirname(project.projectConfigPath)),
    inside(root, project.stateRoot),
  ].filter((value): value is string => value !== undefined);

  return { specificationRoot: SPECIFICATION_ROOT, namespaces: [...new Set(namespaces)] };
}

/**
 * The Engine's uncommitted writes to a checkout, by path: every ledger entry (each owner:
 * Specifications and definitions), and every document change of the checkout that is not settled
 * yet (waiting in the queue, committing, failed to commit, or still writing; the workflow's
 * execution state is one such change with auto-commit on). The `latest` write of a path is its
 * newest unsettled document change (highest sequence), else its ledger entry; only its post-image
 * attributes the path. A ledger or a plan that cannot be read makes the writes incomplete.
 */
async function engineWritesOf(engine: SpecFlowEngine, workspaceId: string): Promise<EngineWrites> {
  const ledger = new Map<string, EngineWriteFact>();
  const journaled = new Map<string, { sequence: number; write: EngineWriteFact }[]>();

  const listing = await listLedgerRecords(engine.context, { workspaceId });
  for (const entry of listing.records.flatMap((record) => record.entries)) {
    ledger.set(entry.path, {
      sha256: entry.postSha256,
      source: 'ledger',
      operationIds: entry.operationIds,
      operationCount: entry.operationCount,
      executions: entry.executions ?? [],
      latest: false,
    });
  }

  let complete = listing.unreadable === 0 && !listing.truncated;
  try {
    const journals = (await listDocumentChangeJournals(engine.context)).filter(
      (journal) =>
        journal.workspaceId === workspaceId && DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active,
    );
    for (const journal of journals) {
      const plan = decodePlanWithEvidence(
        await readPayload(
          engine.context,
          DOCUMENT_CHANGE_JOURNAL_KIND,
          journal.operationId,
          journal.plan,
        ),
        journal.plan,
      );
      const executionId = journal.agent?.executionId;
      for (const path of plan.paths) {
        const known = journaled.get(path.path) ?? [];
        known.push({
          sequence: journal.sequence,
          write: {
            sha256: path.post?.sha256 ?? null,
            source: 'journal',
            operationIds: [journal.operationId],
            operationCount: 1,
            executions:
              executionId !== undefined ? [{ operationId: journal.operationId, executionId }] : [],
            latest: false,
          },
        });
        journaled.set(path.path, known);
      }
    }
  } catch {
    // A journal or a plan that cannot be read: its paths cannot be attributed (fail closed).
    complete = false;
  }

  const byPath = new Map<string, readonly EngineWriteFact[]>();
  for (const path of new Set([...ledger.keys(), ...journaled.keys()])) {
    const changes = (journaled.get(path) ?? [])
      .sort((left, right) => left.sequence - right.sequence)
      .map((entry) => entry.write);
    const entry = ledger.get(path);
    const writes = [...(entry ? [entry] : []), ...changes];
    byPath.set(
      path,
      writes.map((write, index) => ({ ...write, latest: index === writes.length - 1 })),
    );
  }

  return { byPath, complete };
}

/**
 * The attribution facts of a registered checkout now; `undefined` with Git off (nothing can be told
 * uncommitted, and nothing is committed). A checkout the registry does not know cannot be read:
 * incomplete (fail closed).
 */
export async function engineAttributionFacts(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<AttributionFacts | undefined> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return undefined;
  }

  const workspace = (await readWorkspaceRegistry(engine.context)).workspaces.find(
    (entry) => entry.workspaceId === workspaceId,
  );
  if (!workspace) {
    return { paths: [], incomplete: true };
  }

  let unclean;
  try {
    unclean = await listUncleanPaths(workspace.root);
  } catch {
    // Git cannot tell what is uncommitted: nothing is attributed (an attribution refusal, not Close's).
    return { paths: [], incomplete: true };
  }

  return attributionFactsOf(
    workspace.root,
    unclean,
    layoutOf(engine, workspace.root),
    await engineWritesOf(engine, workspaceId),
  );
}
