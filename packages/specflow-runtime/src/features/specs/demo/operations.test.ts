import { BRANCH_NAME_MAX_LENGTH, isValidBranchName } from '@nevo/specflow-contracts/specs';
import { describe, expect, it } from 'vitest';
import { DocumentError } from '@nevo/specflow-engine';
import { createDemoEnvironment } from '../../../demo';
import { createDemoSpecsRepositories } from './repositories';

const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;
function setup() {
  let sequence = 0;
  const env = createDemoEnvironment({ id: () => String(++sequence) });
  const create = {
    operationId: op(1),
    title: 'Logowanie SSO',
    catalogueRevision: env.state.catalogue.revision,
    archetypeId: 'feature',
    archetypeVersion: 1,
    optionalDocumentIds: ['decisions'],
  };
  const spec = env.specs.create('alice', create);
  const session = {
    requestId: 'session',
    catalogueRevision: env.state.catalogue.revision,
    providerId: 'codex',
    modelId: 'model-a',
    mode: 'agent',
  };
  const { catalogue } = createDemoSpecsRepositories(env);
  const find = (specId: string) => catalogue.find(specId);
  const directory = (specId: string) => env.state.specifications.get(specId)!.documents;

  return { env, create, spec, session, find, directory };
}

async function refusal(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof DocumentError) {
      return error.code;
    }

    throw error;
  }

  return 'resolved';
}

describe('Specification-owned demo location', () => {
  it('checks revision at commit when two saves use the same earlier read snapshot', async () => {
    const { env, spec, find, directory } = setup();
    expect(spec.documentIds).toEqual(['overview', 'decisions']);
    const revision = directory(spec.specId).files.get('overview.md')!.revision;
    const save = (n: number, content: string) =>
      env.documents.save(
        'alice',
        spec.specId,
        'overview',
        { operationId: op(100 + n), content, expectedRevision: revision },
        find,
      );
    await save(1, '# First save');
    expect(await refusal(save(2, '# Stale save'))).toBe('DOCUMENT_REVISION_CONFLICT');
    const saved = directory(spec.specId).files.get('overview.md')!;
    expect(new TextDecoder().decode(saved.bytes)).toBe('# First save');
  });
  it.each([
    '/absolute',
    'a//b',
    '.',
    'a/../b',
    'a b',
    'a\nb',
    'a..b',
    'a@{b',
    'a\\b',
    'a~b',
    'a^b',
    'a:b',
    'a?b',
    'a*b',
    'a[b',
    'a.',
    'a/',
    'a.lock',
    'a.lock/b',
    'x'.repeat(BRANCH_NAME_MAX_LENGTH + 1),
  ])('rejects unsafe branch %j before creating anything', (branch) => {
    const { env, create } = setup();
    expect(() =>
      env.specs.create('alice', {
        ...create,
        operationId: op(2),
        target: { kind: 'new-worktree', branch },
      }),
    ).toThrowError(expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }));
    expect(env.state.specifications.size).toBe(1);
  });

  it('accepts a branch of exactly the contracts limit', () => {
    const branch = 'x'.repeat(BRANCH_NAME_MAX_LENGTH);
    expect(BRANCH_NAME_MAX_LENGTH).toBe(240);
    expect(isValidBranchName(branch)).toBe(true);
    expect(isValidBranchName(branch + 'x')).toBe(false);
    const { env, create } = setup();
    expect(() =>
      env.specs.create('alice', {
        ...create,
        operationId: op(3),
        target: { kind: 'new-worktree', branch },
      }),
    ).not.toThrow();
  });

  it('isolates operation keys by identity and replays the same body without a second spec', () => {
    const { env, create, spec } = setup();
    const other = env.specs.create('bob', create);
    expect(other.specId).not.toBe(spec.specId);
    expect(env.specs.create('alice', create)).toEqual(spec);
    expect(() => env.specs.create('alice', { ...create, title: 'Inny tytuł' })).toThrowError(
      expect.objectContaining({ code: 'CREATE_CONFLICT' }),
    );
    expect(env.state.specifications.size).toBe(2);
  });

  describe('explicit slug', () => {
    it('uses the slug for the specification and the generated branch', () => {
      const { env, create } = setup();
      const spec = env.specs.create('alice', {
        ...create,
        operationId: op(5),
        slug: 'my-slug',
        target: { kind: 'new-worktree' },
      });
      expect(spec.slug).toBe('my-slug');
      expect(spec.relativeManifestPath).toBe('specs/my-slug/manifest.json');
    });

    it('conflicts on a taken slug instead of renaming, and on a replay with another slug', () => {
      const { env, create } = setup();
      const input = { ...create, operationId: op(6), title: 'Inny', slug: 'my-slug' };
      env.specs.create('alice', input);
      expect(() => env.specs.create('alice', { ...input, operationId: op(7) })).toThrowError(
        expect.objectContaining({ code: 'CREATE_CONFLICT' }),
      );
      expect(() => env.specs.create('alice', { ...input, slug: 'other' })).toThrowError(
        expect.objectContaining({ code: 'CREATE_CONFLICT' }),
      );
    });

    it('rejects a malformed slug and keeps title derivation when no slug is given', () => {
      const { env, create } = setup();
      expect(() =>
        env.specs.create('alice', { ...create, operationId: op(8), slug: 'Not Valid' }),
      ).toThrowError(expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }));
      expect(
        env.specs.create('alice', { ...create, operationId: op(9), title: 'Zażółć' }).slug,
      ).toBe('zazolc');
    });
  });

  describe('idempotent create order: the operation record is consulted before the catalogue', () => {
    it('replays a COMPLETED operation after the catalogue revision changed without a second spec', () => {
      const { env, create, spec } = setup();
      env.state.catalogue.revision = 'changed-after-create';
      const replay = env.specs.createWithOutcome('alice', create);
      expect(replay).toEqual({ result: spec, fresh: false });
      expect(env.state.specifications.size).toBe(1);
    });

    it('still rejects a NEW operation with a stale revision', () => {
      const { env, create } = setup();
      expect(() =>
        env.specs.create('alice', { ...create, operationId: op(2), catalogueRevision: 'stale' }),
      ).toThrowError(expect.objectContaining({ code: 'CATALOGUE_STALE' }));
      expect(env.state.specifications.size).toBe(1);
    });

    it('a replay with a different body conflicts even when the revision is stale now', () => {
      const { env, create } = setup();
      env.state.catalogue.revision = 'changed-after-create';
      expect(() => env.specs.create('alice', { ...create, title: 'Inny tytuł' })).toThrowError(
        expect.objectContaining({ code: 'CREATE_CONFLICT' }),
      );
      expect(env.state.specifications.size).toBe(1);
    });

    it('an unknown operation validates the selection as before', () => {
      const { env, create } = setup();
      expect(() =>
        env.specs.create('alice', { ...create, operationId: op(3), optionalDocumentIds: ['x'] }),
      ).toThrowError(expect.objectContaining({ code: 'ARCHETYPE_UNKNOWN' }));
    });

    it('a recovery-required operation keeps answering recovery, then resolves on request', () => {
      const { env, create } = setup();
      const pending = { ...create, operationId: op(4) };
      expect(() => env.specs.create('alice', pending, ['recovery-required'])).toThrowError(
        expect.objectContaining({ code: 'CREATE_RECOVERY_REQUIRED' }),
      );
      expect(() => env.specs.create('alice', pending)).toThrowError(
        expect.objectContaining({ code: 'CREATE_RECOVERY_REQUIRED' }),
      );
      const resolved = env.specs.createWithOutcome('alice', pending, ['recovery-resolved']);
      expect(resolved.fresh).toBe(false);
      expect(env.state.specifications.size).toBe(2);
    });

    it.each([
      ['branch-protected', 422],
      ['commit-blocked', 409],
    ] as const)('the %s scenario refuses without creating anything', (scenario, status) => {
      const { env, create } = setup();
      const before = env.state.specifications.size;
      expect(() =>
        env.specs.create('alice', { ...create, operationId: op(5) }, [scenario]),
      ).toThrowError(expect.objectContaining({ status }));
      expect(env.state.specifications.size).toBe(before);
    });

    it('commit-failed answers COMMIT_FAILED once, then CREATE_RECOVERY_REQUIRED for the same operation', () => {
      const { env, create } = setup();
      const pending = { ...create, operationId: op(6) };
      expect(() => env.specs.create('alice', pending, ['commit-failed'])).toThrowError(
        expect.objectContaining({ code: 'COMMIT_FAILED', status: 503 }),
      );
      expect(() => env.specs.create('alice', pending)).toThrowError(
        expect.objectContaining({ code: 'CREATE_RECOVERY_REQUIRED' }),
      );
    });
  });

  it('resolves the place at create and Session snapshots never share mutable location state', () => {
    const { env, spec, session } = setup();
    const location = env.state.locations.get(spec.specId)!;
    expect(location).toEqual({ ...env.state.catalogue.currentLocation, branch: 'develop' });
    const configuration = {
      title: 'Logowanie SSO',
      archetype: 'Feature v2',
      documents: ['Specification'],
    };
    const allocated = env.sessions.allocate('alice', spec.specId, configuration, session);
    env.state.locations.get(spec.specId)!.branch = 'changed-in-future';
    expect(env.state.sessions.get(allocated.sessionId)?.location.branch).toBe('develop');
  });

  it('a new-worktree create fixes a simulated worktree location for the Session', () => {
    const { env, create } = setup();
    const created = env.specs.create('alice', {
      ...create,
      operationId: op(3),
      target: { kind: 'new-worktree', branch: 'spec/logowanie-sso' },
    });
    expect(env.state.locations.get(created.specId)).toMatchObject({
      kind: 'simulated-worktree',
      branch: 'spec/logowanie-sso',
      simulated: true,
    });
    expect(env.state.specifications.get(created.specId)!.documents.registry[0]).toEqual({
      id: 'overview',
      path: 'overview.md',
      type: 'overview',
    });
  });
});

describe('Document additions and separate branch policy', () => {
  it('creates nested imports atomically and fingerprints their content', () => {
    const { env, create, directory } = setup();
    const input = {
      ...create,
      operationId: op(10),
      folders: ['research'],
      addedDocuments: [
        { path: 'decisions/adr.md', type: 'note', content: '# Decision' },
        { path: 'research/call.txt', content: 'Customer meeting' },
      ],
    };
    const result = env.specs.create('alice', input);
    expect(env.specs.create('alice', input)).toEqual(result);
    expect(directory(result.specId).folders).toEqual(['research']);
    // Templates first (overview, decisions), then the typed addition; the untyped one is unclassified.
    expect(result.documentIds).toEqual(['overview', 'decisions', 'note']);
    expect([...directory(result.specId).files.keys()].sort()).toEqual([
      'decisions.md',
      'decisions/adr.md',
      'overview.md',
      'research/call.txt',
    ]);
    expect(() =>
      env.specs.create('alice', {
        ...input,
        addedDocuments: [{ path: 'decisions/adr.md', content: '# Changed' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'CREATE_CONFLICT' }));
    expect(() =>
      env.specs.create('alice', {
        ...create,
        operationId: op(11),
        addedDocuments: [{ path: 'OVERVIEW.md', content: '' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }));
    expect(() =>
      env.specs.create('alice', {
        ...create,
        operationId: op(12),
        addedDocuments: [{ path: '../escape.md', content: '' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_PATH_INVALID' }));
    expect(env.state.specifications.size).toBe(2);
  });
  it('replays imports without duplication and rejects a conflicting batch without partial writes', async () => {
    const { env, spec, find, directory } = setup();
    const input = {
      operationId: op(30),
      documents: [{ path: 'research/interview.txt', content: 'Interview' }],
    };
    const first = await env.documents.create('alice', spec.specId, input, find);
    expect(await env.documents.create('alice', spec.specId, input, find)).toEqual(first);
    expect(first.documents[0]!.path).toBe('research/interview.txt');
    expect(
      await refusal(
        env.documents.create(
          'alice',
          spec.specId,
          {
            operationId: op(31),
            documents: [
              { path: 'new.md', content: '' },
              { path: 'RESEARCH/INTERVIEW.TXT', content: '' },
            ],
          },
          find,
        ),
      ),
    ).toBe('DOCUMENT_PATH_CONFLICT');
    expect(directory(spec.specId).files.size).toBe(3);
  });
  it.each([
    '../escape.md',
    '/abs.md',
    'C:/file.md',
    'foo\\bar.md',
    'a//b.md',
    'a/./b.md',
    'a/../b.md',
    'a\u0000.md',
    'file.pdf',
    'a.md/child.txt',
  ])('rejects invalid or file-as-folder path %j atomically', async (path) => {
    const { env, spec, find, directory } = setup();
    await env.documents.create(
      'alice',
      spec.specId,
      { operationId: op(40), documents: [{ path: 'a.md', content: '' }] },
      find,
    );
    expect(
      await refusal(
        env.documents.create(
          'alice',
          spec.specId,
          { operationId: op(41), documents: [{ path, content: '' }] },
          find,
        ),
      ),
    ).toMatch(/^DOCUMENT_PATH_(INVALID|CONFLICT)$/u);
    expect(directory(spec.specId).files.size).toBe(3);
  });
});

describe('Neutral authoring workflow templates', () => {
  it('creates an arbitrary feature title with the Engine scaffold, without unrelated SSO requirements', () => {
    const env = createDemoEnvironment();
    const created = env.specs.create('alice', {
      operationId: op(20),
      title: 'Export CSV',
      goal: 'Let owners export a list.',
      catalogueRevision: env.state.catalogue.revision,
      archetypeId: 'feature',
      archetypeVersion: 1,
      optionalDocumentIds: [],
    });
    expect(created.documentIds).toEqual(['overview']);
    const files = env.state.specifications.get(created.specId)!.documents.files;
    const content = new TextDecoder().decode(files.get('overview.md')!.bytes);
    expect(content).toContain('# Export CSV');
    expect(content).toContain('## Goal');
    expect(content).toContain('Let owners export a list.');
    expect(content).toContain('## Acceptance Criteria & Verification');
    expect(content).not.toMatch(/SSO|OIDC|logowan|dostawc|tożsamości/i);
  });
});
