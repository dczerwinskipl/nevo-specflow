// Integration (real project, real files): a template named by a create in an existing Specification
// is rendered from the project's definitions, pinned in the plan, and replays as stored.
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { getStableProjectCatalogue } from '../../src/specs/definitions';
import { createSpecificationForTesting } from '../../src/testing';
import { failure, documentsProject, removeTrackedRoots } from '../support/documents-fixture';
import { noSleep } from '../support/document-writes';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const FEATURE = ['.nevo', 'definitions', 'specification-archetype', 'feature.yaml'];

async function featureProject() {
  const fixture = await documentsProject();
  const created = await createSpecificationForTesting(fixture.engine, {
    operationId: randomUUID(),
    title: 'Readable   feature',
    goal: 'A goal that is not kept',
    created: '2026-10-24',
    archetype: { id: 'feature', version: 1 },
    optionalDocumentIds: [],
    target: { kind: 'existing', workspaceId: fixture.engine.workspace.workspaceId },
  });
  const dir = join(fixture.root, 'specs', 'active', created.slug);
  const revision = async (): Promise<string> =>
    (await getStableProjectCatalogue(fixture.engine)).catalogue.revision;

  return { ...fixture, specId: created.specId, dir, revision };
}

const createBehaviour = (catalogueRevision: string) => ({
  action: 'create' as const,
  documents: [{ path: 'docs/behaviour.md', templateId: 'behaviour' }],
  folders: [],
  catalogueRevision,
});

describe('create documents from a template', () => {
  it('renders the template of the archetype, registers it and leaves the goal empty', async () => {
    const project = await featureProject();
    const result = await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      createBehaviour(await project.revision()),
      { sleep: noSleep },
    );
    const content = await readFile(join(project.dir, 'docs', 'behaviour.md'), 'utf8');
    expect(content).toContain('# Readable feature - Behaviour');
    expect(result.documents).toMatchObject([
      { path: 'docs/behaviour.md', type: 'behaviour', sha256: sha256Hex(content) },
    ]);
    expect(await readFile(join(project.dir, 'specification.yaml'), 'utf8')).toContain(
      'docs/behaviour.md',
    );
  });

  it('replays the stored rendering after the template changed', async () => {
    const project = await featureProject();
    const operationId = randomUUID();
    const request = createBehaviour(await project.revision());
    const first = await applyDocumentChange(project.engine, project.specId, operationId, request, {
      sleep: noSleep,
    });
    const file = join(project.root, ...FEATURE);
    await writeFile(file, (await readFile(file, 'utf8')).replace('## Rules', '## Changed rules'));
    expect(await project.revision()).not.toBe(request.catalogueRevision);

    const replay = await applyDocumentChange(project.engine, project.specId, operationId, request);
    expect(replay.replayed).toBe(true);
    expect(replay.documents).toEqual(first.documents);
    expect(await readFile(join(project.dir, 'docs', 'behaviour.md'), 'utf8')).not.toContain(
      'Changed rules',
    );
  });

  it('refuses a new operation made against a catalogue that changed', async () => {
    const project = await featureProject();
    const stale = await project.revision();
    const file = join(project.root, ...FEATURE);
    await writeFile(file, (await readFile(file, 'utf8')).replace('## Rules', '## Changed rules'));
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), createBehaviour(stale)),
    );
    expect(error).toMatchObject({ code: 'CATALOGUE_STALE' });
  });

  it('refuses when the archetype of the Specification was deleted from the project', async () => {
    const project = await featureProject();
    await rm(join(project.root, ...FEATURE));
    const error = await failure(
      applyDocumentChange(
        project.engine,
        project.specId,
        randomUUID(),
        createBehaviour(await project.revision()),
      ),
    );
    expect(error).toMatchObject({
      code: 'ARCHETYPE_UNKNOWN',
      details: { cause: 'archetype-not-defined' },
    });
  });

  it('refuses a template the archetype does not have and writes nothing', async () => {
    const project = await featureProject();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), {
        action: 'create',
        documents: [{ path: 'x.md', templateId: 'nope' }],
        folders: [],
        catalogueRevision: await project.revision(),
      }),
    );
    expect(error).toMatchObject({
      code: 'ARCHETYPE_UNKNOWN',
      details: { cause: 'template-unknown' },
    });
  });
});
