import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationScaffold,
  withProjectControlLock,
} from '../src/testing';
import {
  fingerprintCreateClientIntent,
  normalizeCreateClientIntent,
} from '../src/specs/create-intent';
import { parseCreateJournal } from '../src/specs/create/journal-codec';
import { CREATE_STAGES, type CreateJournal } from '../src/specs/create/journal-model';
import {
  closeJournalPath,
  publishCloseJournal,
  readCloseJournal,
} from '../src/specs/lifecycle/journal-store';
import {
  fingerprintCloseIntent,
  resourcesForClosePlan,
  type CloseJournal,
  type ClosePlan,
} from '../src/specs/lifecycle/model';
import { createGitTestProject, git } from './support/git-project';

/**
 * Q00 characterization, pinned to pre-refactor tree abada44.
 * These are structural/IO codec fixtures, NOT evidence of successful Git effects.
 * The separate real-Git lifecycle suites remain the behavioral authority.
 */
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

describe('Q00 Create journal current-format acceptance baseline', () => {
  it('accepts every current stage without inferring physical progress from the stage', async () => {
    const root = await createGitTestProject('q00-create-journal-Ż ', 'runtime: {}\n');
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    const title = 'Q00 journal';
    const specId = randomUUID();
    const scaffold = createSpecificationScaffold({ specId, title, created: '2026-10-19' });
    const requestIntent = normalizeCreateClientIntent({
      title,
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    const original: CreateJournal = {
      version: 1,
      projectId: engine.context.project.projectId,
      operationId: randomUUID(),
      requestIntent,
      inputFingerprint: fingerprintCreateClientIntent(requestIntent),
      specId,
      slug: scaffold.slug,
      title,
      created: '2026-10-19',
      stage: 'reserved',
      target: {
        kind: 'existing',
        workspaceId: engine.workspace.workspaceId,
        workspaceRoot: root,
      },
      files: scaffold.files.map(({ relativePath, sha256 }) => ({ relativePath, sha256 })),
    };

    // The commit stages exist only for a journal that pins commit evidence at reservation.
    const commitEvidence = (stage: string) => ({
      required: true as const,
      branch: 'main',
      parentHead: 'a'.repeat(40),
      ...(stage === 'commit-written' ? { commitSha: 'b'.repeat(40) } : {}),
    });
    for (const stage of CREATE_STAGES) {
      const needsCommit = stage === 'commit-writing' || stage === 'commit-written';
      const value = needsCommit
        ? { ...original, stage, commit: commitEvidence(stage) }
        : { ...original, stage };
      expect(parseCreateJournal(engine.context, value, original.operationId)).toEqual(value);
    }

    const rejected: readonly [string, unknown][] = [
      ['version 2', { ...original, version: 2 }],
      ['foreign Project Home', { ...original, projectId: randomUUID() }],
      ['forged fingerprint', { ...original, inputFingerprint: 'a'.repeat(64) }],
      [
        'legacy change.yaml',
        {
          ...original,
          files: [
            { ...original.files[0]!, relativePath: 'specs/active/q00-journal/change.yaml' },
            original.files[1],
          ],
        },
      ],
      [
        'unexpected target key',
        { ...original, target: { ...original.target, branch: 'untrusted' } },
      ],
      ['future stage', { ...original, stage: 'future-stage' }],
    ];

    for (const [name, value] of rejected) {
      expect(
        () => parseCreateJournal(engine.context, value, original.operationId),
        name,
      ).toThrowError(expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }));
    }

    // Current implementation accepts unknown top-level keys. This is a
    // characterization, not permission to tighten it in Q01 silently.
    const unknownTopLevel = { ...original, unrecognized: true };
    expect(parseCreateJournal(engine.context, unknownTopLevel, original.operationId)).toEqual(
      unknownTopLevel,
    );
  });
});

describe('Q00 Close journal current-format acceptance baseline', () => {
  it('characterizes Close stages and rejects tampered journal bytes', async () => {
    const root = await createGitTestProject('q00-close-journal-Ż ', 'runtime: {}\n');
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    const context = engine.context;
    const head = git(root, 'rev-parse', 'HEAD');
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    const primary = {
      workspaceId: engine.workspace.workspaceId,
      root,
      branch,
      head,
    };
    const linked = {
      workspaceId: randomUUID(),
      root: join(root, 'linked-worktree'),
      branch: 'spec/q00',
      head: 'a'.repeat(40),
      instanceId: randomUUID(),
    };
    const operationId = randomUUID();
    const specId = randomUUID();

    function plan(
      kind: ClosePlan['kind'],
      mode: 'primary' | 'linked-integrate' | 'linked-archive',
    ): ClosePlan {
      const source = mode === 'primary' ? primary : linked;
      const needsTarget = mode !== 'linked-archive';
      const request =
        kind === 'worktree-close'
          ? { kind: 'worktree-close' as const, operationId, specId }
          : {
              kind: 'specification-close' as const,
              operationId,
              specId,
              integrateToTargetBranch: mode === 'linked-integrate',
            };
      const proposed: ClosePlan = {
        kind,
        operationId,
        specId,
        fingerprint: fingerprintCloseIntent(request),
        slug: 'q00',
        location: 'active',
        registryRevision: 2,
        source,
        ...(needsTarget
          ? { target: primary, targetBranch: primary.branch, configRevision: 'b'.repeat(64) }
          : {}),
        ...(kind === 'specification-close' && mode !== 'primary'
          ? { integrateToTargetBranch: mode === 'linked-integrate' }
          : {}),
        resources: [],
      };
      return {
        ...proposed,
        resources: resourcesForClosePlan(proposed, context.project.projectId),
      };
    }

    const primaryPlan = plan('specification-close', 'primary');
    const worktreePlan = plan('worktree-close', 'linked-integrate');
    const linkedArchivePlan = plan('specification-close', 'linked-archive');
    const linkedIntegrationPlan = plan('specification-close', 'linked-integrate');

    function record(
      selectedPlan: ClosePlan,
      stage: CloseJournal['stage'],
      proof: Partial<CloseJournal> = {},
    ): CloseJournal {
      return {
        version: 1,
        projectId: context.project.projectId,
        gitInstanceId: context.project.gitInstanceId,
        plan: selectedPlan,
        stage,
        ...proof,
      };
    }

    function archive(selectedPlan: ClosePlan, committed: boolean) {
      return {
        sourceCommit: selectedPlan.source.head,
        sourcePath: 'specs/active/q00',
        destinationPath: 'specs/archive/q00',
        files: [{ relativePath: 'specs/active/q00/specification.yaml', sha256: 'c'.repeat(64) }],
        archivedManifestSha256: 'd'.repeat(64),
        ...(committed ? { committedHead: 'e'.repeat(40), committedTree: 'f'.repeat(40) } : {}),
      };
    }

    function integration(selectedPlan: ClosePlan, divergent: boolean, published: boolean) {
      const sourceCommit =
        selectedPlan.kind === 'worktree-close' ? selectedPlan.source.head : 'e'.repeat(40);
      return {
        sourceCommit,
        targetCommit: selectedPlan.target!.head,
        mergeBaseCommit: selectedPlan.target!.head,
        sourceTree: '1'.repeat(40),
        targetTree: '2'.repeat(40),
        relationship: divergent ? ('divergent' as const) : ('fast-forward' as const),
        ...(published ? { publishedCommit: divergent ? '3'.repeat(40) : sourceCommit } : {}),
      };
    }

    const scratchBase = {
      root: join(context.project.stateRoot, 'engine', 'integration-scratch', operationId),
      instanceId: randomUUID(),
    };
    const scratchCandidate = {
      ...scratchBase,
      candidateCommit: '3'.repeat(40),
      candidateTree: '4'.repeat(40),
    };
    const scratchConflict = {
      ...scratchBase,
      conflictPaths: ['src/conflict.txt'],
      conflictIndexHash: '5'.repeat(64),
    };
    const ff = integration(worktreePlan, false, false);
    const ffPublished = integration(worktreePlan, false, true);
    const divergent = integration(worktreePlan, true, false);
    const archiveCommitted = archive(primaryPlan, true);
    const linkedArchiveCommitted = archive(linkedIntegrationPlan, true);
    const archivedConflict = record(linkedIntegrationPlan, 'archived-linked-awaiting-integration', {
      archive: linkedArchiveCommitted,
      integration: integration(linkedIntegrationPlan, true, false),
      scratch: scratchConflict,
      outcome: 'archived-linked-awaiting-integration',
    });

    const accepted: readonly [string, CloseJournal][] = [
      ['primary reserved', record(primaryPlan, 'reserved')],
      [
        'archive intent',
        record(primaryPlan, 'archive-initiated', { archive: archive(primaryPlan, false) }),
      ],
      [
        'archive commit intent',
        record(primaryPlan, 'archive-commit-initiated', { archive: archive(primaryPlan, false) }),
      ],
      [
        'archive committed',
        record(primaryPlan, 'archive-committed', { archive: archiveCommitted }),
      ],
      [
        'primary terminal',
        record(primaryPlan, 'completed', {
          archive: archiveCommitted,
          outcome: 'archived-in-primary',
        }),
      ],
      [
        'linked archive-only terminal',
        record(linkedArchivePlan, 'completed', {
          archive: archive(linkedArchivePlan, true),
          outcome: 'archive-only-closed',
        }),
      ],
      [
        'linked archive-integrate preparation',
        record(linkedIntegrationPlan, 'integration-preparation-initiated', {
          archive: linkedArchiveCommitted,
          integration: integration(linkedIntegrationPlan, false, false),
        }),
      ],
      [
        'worktree preparation',
        record(worktreePlan, 'integration-preparation-initiated', { integration: ff }),
      ],
      [
        'scratch intent',
        record(worktreePlan, 'integration-scratch-initiated', {
          integration: divergent,
          scratch: scratchBase,
        }),
      ],
      [
        'scratch candidate',
        record(worktreePlan, 'integration-scratch-candidate', {
          integration: divergent,
          scratch: scratchCandidate,
        }),
      ],
      [
        'scratch conflict',
        record(worktreePlan, 'integration-scratch-conflict', {
          integration: divergent,
          scratch: scratchConflict,
        }),
      ],
      [
        'publish intent',
        record(worktreePlan, 'integration-publish-initiated', { integration: ff }),
      ],
      [
        'integration verified',
        record(worktreePlan, 'integration-verified', { integration: ffPublished }),
      ],
      [
        'registry rebound',
        record(worktreePlan, 'binding-rebound', { integration: ffPublished, reboundRevision: 3 }),
      ],
      [
        'disposal intent',
        record(worktreePlan, 'disposal-initiated', {
          integration: ffPublished,
          reboundRevision: 3,
        }),
      ],
      [
        'worktree terminal',
        record(worktreePlan, 'completed', {
          integration: ffPublished,
          reboundRevision: 3,
          outcome: 'worktree-integrated-and-removed',
        }),
      ],
      ['retained linked conflict', archivedConflict],
      ['retired conflict scratch', { ...archivedConflict, scratchRetired: true }],
      // Existing Close codec does not reject extra top-level fields.
      [
        'unknown top-level property',
        { ...record(primaryPlan, 'reserved'), extra: 1 } as CloseJournal,
      ],
    ];

    // Use the actual path-safe store for initial creation, then read literal
    // serialized fixture bytes. No mocked Git operations or journal writes.
    await withProjectControlLock(context, () => publishCloseJournal(context, accepted[0]![1]));
    const path = closeJournalPath(context, operationId);
    for (const [name, value] of accepted) {
      const bytes = JSON.stringify(value) + '\n';
      await writeFile(path, bytes);
      expect(await readCloseJournal(context, operationId), name).toEqual(JSON.parse(bytes));
      expect(await readFile(path, 'utf8')).toBe(bytes);
    }

    const rejected: readonly [string, unknown][] = [
      ['wrong version', { ...record(primaryPlan, 'reserved'), version: 2 }],
      ['wrong Project Home', { ...record(primaryPlan, 'reserved'), gitInstanceId: randomUUID() }],
      ['forged fingerprint', record({ ...primaryPlan, fingerprint: 'f'.repeat(64) }, 'reserved')],
      [
        'forged resource claims',
        record({ ...primaryPlan, resources: ['spec:forged'] }, 'reserved'),
      ],
      [
        'missing required primary target',
        record(
          { ...primaryPlan, target: undefined, targetBranch: undefined, configRevision: undefined },
          'reserved',
        ),
      ],
      [
        'illegal primary integration selector',
        record({ ...primaryPlan, integrateToTargetBranch: false }, 'reserved'),
      ],
      ['archive required', record(primaryPlan, 'archive-committed')],
      [
        'uncommitted terminal archive',
        record(primaryPlan, 'completed', {
          archive: archive(primaryPlan, false),
          outcome: 'archived-in-primary',
        }),
      ],
      [
        'missing rebind proof',
        record(worktreePlan, 'completed', {
          integration: ffPublished,
          outcome: 'worktree-integrated-and-removed',
        }),
      ],
      [
        'forged scratch path',
        record(worktreePlan, 'integration-scratch-conflict', {
          integration: divergent,
          scratch: { ...scratchConflict, root: '/forged' },
        }),
      ],
      ['wrong retained conflict outcome', { ...archivedConflict, outcome: 'archive-only-closed' }],
      ['unrecognized future stage', { ...record(primaryPlan, 'reserved'), stage: 'new-stage' }],
      // Declared in CloseStage, but the current store does not accept it.
      ['recovery-required model-only stage', record(primaryPlan, 'recovery-required')],
    ];

    for (const [name, value] of rejected) {
      const bytes = JSON.stringify(value) + '\n';
      await writeFile(path, bytes);
      await expect(readCloseJournal(context, operationId), name).rejects.toMatchObject({
        code: 'CLOSE_JOURNAL_CORRUPT',
      });
      expect(await readFile(path, 'utf8')).toBe(bytes);
    }
  }, 120000);
});
