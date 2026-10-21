import { describe, expect, it } from 'vitest';
import { createDemoEnvironment, DemoOperationError } from '../../../demo';

const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;
function setup() {
  let sequence = 0;
  const env = createDemoEnvironment({ id: () => String(++sequence) });
  const create = {
    operationId: op(1),
    title: 'Logowanie SSO',
    catalogueRevision: env.state.catalogue.revision,
    archetypeId: 'feature',
    archetypeVersion: '2',
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
  return { env, create, spec, session };
}

describe('Specification-owned demo location', () => {
  it('checks revision at commit when two saves use the same earlier read snapshot', () => {
    const { env, spec } = setup();
    const snapshot = structuredClone(
      env.documents.readDocument(spec.specId, spec.documentIds[0]!)!,
    );
    env.documents.save(spec.specId, snapshot, { expectedRevision: '1', content: '# First save' });
    expect(() =>
      env.documents.save(spec.specId, snapshot, { expectedRevision: '1', content: '# Stale save' }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_revision_conflict' }));
    expect(env.documents.readDocument(spec.specId, snapshot.id)?.content).toBe('# First save');
    const seed = { id: 'spec', title: 'Seed', content: '# Seed', revision: 'demo-document-1' };
    env.documents.save('admission', seed, {
      expectedRevision: seed.revision,
      content: '# Saved seed',
    });
    expect(() =>
      env.documents.save('admission', seed, {
        expectedRevision: seed.revision,
        content: '# Lost seed',
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_revision_conflict' }));
    expect(env.documents.readDocument('admission', seed.id)?.content).toBe('# Saved seed');
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
    'x'.repeat(201),
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
      ).toThrowError(expect.objectContaining({ code: 'demo_catalogue_stale' }));
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
      ).toThrowError(expect.objectContaining({ code: 'demo_invalid_selection' }));
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
    expect(env.documents.readDocument(created.specId, created.documentIds[0]!)?.filename).toBe(
      'specification.md',
    );
  });
});

describe('Document additions and separate branch policy', () => {
  it('creates nested imports atomically and fingerprints their content', () => {
    const { env, create } = setup();
    const input = {
      ...create,
      operationId: op(10),
      folders: ['research'],
      addedDocuments: [
        { path: 'decisions/adr.md', content: '# Decision' },
        { path: 'research/call.txt', content: 'Customer meeting' },
      ],
    };
    const result = env.specs.create('alice', input);
    expect(env.specs.create('alice', input)).toEqual(result);
    expect(env.state.specifications.get(result.specId)?.folders).toEqual(['research', 'decisions']);
    expect(result.documentIds).toHaveLength(4);
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
        addedDocuments: [{ path: 'SPECIFICATION.md', content: '' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_path_conflict' }));
    expect(env.state.specifications.size).toBe(2);
  });
  it('replays imports without duplication and rejects a conflicting batch without partial writes', () => {
    const { env, spec } = setup();
    const input = {
      requestId: 'import',
      documents: [{ path: 'research/interview.txt', content: 'Interview' }],
    };
    const first = env.documents.add('alice', spec.specId, input);
    expect(env.documents.add('alice', spec.specId, input)).toEqual(first);
    const existing = env.documents.readDocument(spec.specId, first.documentIds[0]!)!;
    expect(existing.filename).toBe('research/interview.txt');
    env.documents.save(spec.specId, existing, { expectedRevision: '1', content: 'Revised' });
    expect(() =>
      env.documents.add('alice', spec.specId, {
        requestId: 'bad-batch',
        documents: [
          { path: 'new.md', content: '' },
          { path: 'RESEARCH/INTERVIEW.TXT', content: '' },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'demo_document_path_conflict' }));
    expect(env.state.specifications.get(spec.specId)?.documents.size).toBe(3);
    expect(env.documents.readDocument(spec.specId, first.documentIds[0]!)?.content).toBe('Revised');
    expect(env.documents.readDocument('other', first.documentIds[0]!)).toBeUndefined();
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
  ])('rejects invalid or file-as-folder path %j atomically', (path) => {
    const { env, spec } = setup();
    env.documents.add('alice', spec.specId, {
      requestId: 'existing',
      documents: [{ path: 'a.md', content: '' }],
    });
    expect(() =>
      env.documents.add('alice', spec.specId, {
        requestId: 'unsafe',
        documents: [{ path, content: '' }],
      }),
    ).toThrow(DemoOperationError);
    expect(env.state.specifications.get(spec.specId)?.documents.size).toBe(3);
  });
});

describe('Neutral authoring workflow templates', () => {
  it('creates an arbitrary feature title with a scaffold, without unrelated SSO requirements', () => {
    const env = createDemoEnvironment();
    const created = env.specs.create('alice', {
      operationId: op(20),
      title: 'Export CSV',
      catalogueRevision: env.state.catalogue.revision,
      archetypeId: 'feature',
      archetypeVersion: '2',
      optionalDocumentIds: [],
    });
    expect(created.documentIds).toHaveLength(1);
    const document = env.documents.readDocument(created.specId, created.documentIds[0]!)!;
    expect(document.content).toContain('## Problem');
    expect(document.content).toContain('## Proposed behaviour');
    expect(document.content).toContain('## Acceptance criteria');
    expect(document.content).toContain('Opisz oczekiwane zachowanie produktu.');
    expect(document.content).not.toMatch(/SSO|OIDC|logowan|dostawc|tożsamości/i);
  });
});
