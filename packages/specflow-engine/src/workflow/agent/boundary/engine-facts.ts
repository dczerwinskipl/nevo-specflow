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
import type { AttributionFacts } from './attribution';
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
 * The post-images of the Engine's uncommitted writes to a checkout: every ledger entry (each owner:
 * Specifications and definitions), and every document change of the checkout that is not settled
 * yet (waiting in the queue, committing, failed to commit, or still writing; the workflow's
 * execution state is one such change with auto-commit on). A ledger or a plan that cannot be read
 * makes the writes incomplete.
 */
async function engineWritesOf(engine: SpecFlowEngine, workspaceId: string): Promise<EngineWrites> {
  const postImages = new Map<string, (string | null)[]>();
  const add = (path: string, post: string | null) => {
    const known = postImages.get(path) ?? [];
    known.push(post);
    postImages.set(path, known);
  };

  const listing = await listLedgerRecords(engine.context, { workspaceId });
  for (const entry of listing.records.flatMap((record) => record.entries)) {
    add(entry.path, entry.postSha256);
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
      for (const path of plan.paths) {
        add(path.path, path.post?.sha256 ?? null);
      }
    }
  } catch {
    // A journal or a plan that cannot be read: its paths cannot be attributed (fail closed).
    complete = false;
  }

  return { postImages, complete };
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

  const unclean = await listUncleanPaths(workspace.root);

  return attributionFactsOf(
    workspace.root,
    unclean,
    layoutOf(engine, workspace.root),
    await engineWritesOf(engine, workspaceId),
  );
}
