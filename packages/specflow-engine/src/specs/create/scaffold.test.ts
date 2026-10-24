import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedProjectHome } from '../../project/home/home';
import { BUILT_IN_DEFINITIONS } from '../archetypes/builtins';
import { resolveCatalogue } from '../archetypes/catalogue';
import { createSpecificationScaffold } from '../scaffold';
import { fingerprintCreateClientIntent, normalizeCreateClientIntent } from './intent';
import type { CreateJournal } from './journal';
import { writeCreatePayload } from './journal/payload';
import { CREATE_JOURNAL_RELATIVE_DIR } from './journal/store';
import { expectedScaffold } from './scaffold';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

async function engineFixture() {
  const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-scaffold-')));
  roots.push(stateRoot);
  await mkdir(join(stateRoot, CREATE_JOURNAL_RELATIVE_DIR), { recursive: true });
  return {
    context: { project: { stateRoot, projectId: randomUUID() } } as unknown as ResolvedProjectHome,
  };
}

/** A catalogue that differs from the built-in one in the text of the overview template. */
function changedCatalogue() {
  const definitions = structuredClone(BUILT_IN_DEFINITIONS);
  for (const archetype of definitions.archetypes ?? []) {
    for (const template of archetype.templates) {
      if (template.id === 'overview') template.content = '# Changed {{specificationTitle}}\n';
    }
  }
  return resolveCatalogue(definitions);
}

function journalFor(scaffold: ReturnType<typeof createSpecificationScaffold>): CreateJournal {
  const requestIntent = normalizeCreateClientIntent({
    title: 'Pinned',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing', workspaceId: randomUUID() },
  });
  return {
    version: 2,
    projectId: randomUUID(),
    operationId: randomUUID(),
    requestIntent,
    inputFingerprint: fingerprintCreateClientIntent(requestIntent),
    specId: scaffold.specId,
    slug: scaffold.slug,
    title: 'Pinned',
    created: '2026-10-14',
    catalogueRevision: 'old-revision',
    documentIds: scaffold.documentIds,
    stage: 'manifest-writing',
    target: { kind: 'existing', workspaceId: randomUUID(), workspaceRoot: '/workspace' },
    files: scaffold.files.map(({ relativePath, sha256, bytes }) => ({
      relativePath,
      sha256,
      bytes,
    })),
  };
}

describe('Create scaffold recovery source', () => {
  it('reads the scaffold from the verified payload, not from the current catalogue', async () => {
    const engine = await engineFixture();
    const input = {
      specId: randomUUID(),
      title: 'Pinned',
      created: '2026-10-14',
      archetypeId: 'minimal',
    };
    // The journal was reserved while the catalogue read "Changed ...".
    const pinned = createSpecificationScaffold({ ...input, catalogue: changedCatalogue() });
    const live = createSpecificationScaffold(input);
    expect(pinned.files[1]!.content).not.toBe(live.files[1]!.content);

    const journal = journalFor(pinned);
    await writeCreatePayload(
      engine.context,
      journal.operationId,
      pinned.files.map(({ sha256, content }) => ({ sha256, content })),
    );
    const files = await expectedScaffold(engine, journal);
    expect(files.map((file) => file.content)).toEqual(pinned.files.map((file) => file.content));
    expect(files[1]!.content).toContain('# Changed Pinned');
  });

  it('is recovery-required when a payload file is missing', async () => {
    const engine = await engineFixture();
    const scaffold = createSpecificationScaffold({
      specId: randomUUID(),
      title: 'Pinned',
      created: '2026-10-14',
      archetypeId: 'minimal',
    });
    const journal = journalFor(scaffold);
    await writeCreatePayload(engine.context, journal.operationId, [
      { sha256: scaffold.files[0]!.sha256, content: scaffold.files[0]!.content },
    ]);
    await expect(expectedScaffold(engine, journal)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
  });

  it('is recovery-required when the journal ids differ from the registry in the manifest', async () => {
    const engine = await engineFixture();
    const scaffold = createSpecificationScaffold({
      specId: randomUUID(),
      title: 'Pinned',
      created: '2026-10-14',
      archetypeId: 'minimal',
    });
    const journal = { ...journalFor(scaffold), documentIds: ['something-else'] };
    await writeCreatePayload(
      engine.context,
      journal.operationId,
      scaffold.files.map(({ sha256, content }) => ({ sha256, content })),
    );
    await expect(expectedScaffold(engine, journal)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
  });
});
