// Integration (real project, real files): a template named by a create in an existing Specification
// is rendered from the project's definitions, pinned in the plan, and replays as stored.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { useSlowGitTestTimeouts } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange, applyTaskDocumentChange } from '../../src/specs/documents/api';
import { readRegisteredDocumentSummaries } from '../../src/specs/documents/summaries';
import { readTaskDocuments } from '../../src/specs/documents/task-document-reader';
import { readSpecificationDocumentTree } from '../../src/specs/documents/tree-reader';
import {
  generatedTaskMainDocument,
  initialTaskDocument,
  parseTaskManifest,
  serializeTaskIndex,
  serializeTaskManifest,
} from '../../src/tasks/resource/codec';
import type { TaskManifest } from '../../src/tasks/resource/model';
import { getStableProjectCatalogue } from '../../src/definitions';
import { createSpecificationForTesting } from '../../src/testing';
import { failure, documentsProject, removeTrackedRoots } from '../support/documents-fixture';
import { noSleep } from '../support/document-writes';

// Real Git on a slow runner: the seconds of Linux are minutes there.
useSlowGitTestTimeouts();

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
    expect(content).toContain('# Behaviour');
    expect(result.documents).toMatchObject([
      { path: 'docs/behaviour.md', type: 'behaviour', sha256: sha256Hex(content) },
    ]);
    expect(await readFile(join(project.dir, 'specification.yaml'), 'utf8')).toContain(
      'docs/behaviour.md',
    );

    // The baseline exactly while the file has the content the Engine created it with: the
    // overview of Create and this document, whatever their goal or title text. The document tree
    // reports the same value as the workspace summary (one rule).
    const contentState = async () => {
      const summaries = Object.fromEntries(
        (await readRegisteredDocumentSummaries(project.engine, project.specId)).map((summary) => [
          summary.path,
          summary.contentState,
        ]),
      );
      const tree = Object.fromEntries(
        (await readSpecificationDocumentTree(project.engine, project.specId)).documents.map(
          (document) => [document.path, document.contentState],
        ),
      );
      expect(tree).toEqual(summaries);

      return summaries;
    };

    expect(await contentState()).toEqual({
      'overview.md': 'baseline',
      'docs/behaviour.md': 'baseline',
    });
    const path = join(project.dir, 'docs', 'behaviour.md');
    await writeFile(path, content + 'Given a written scenario.\n');
    expect(await contentState()).toEqual({
      'overview.md': 'baseline',
      'docs/behaviour.md': 'authored',
    });
    await writeFile(path, content);
    expect(await contentState()).toEqual({
      'overview.md': 'baseline',
      'docs/behaviour.md': 'baseline',
    });
  });

  it('keeps the baseline revision a Task registry records, and reports the content state by it', async () => {
    // The Engine records the baseline of a generated task.md (`generatedTaskMainDocument`); the
    // second document's record is written by hand (Task documents are created from given content).
    const project = await featureProject();
    const content = '# Behaviour\n';
    const brief: TaskManifest = {
      id: 'brief',
      title: 'Write the brief',
      type: 'implementation',
      status: 'draft',
      dependsOn: [],
      origin: { kind: 'manual', actorId: 'local:me' },
      documents: [
        generatedTaskMainDocument(initialTaskDocument({ title: 'Write the brief' })),
        {
          id: 'behaviour',
          path: 'behaviour.md',
          type: 'behaviour',
          baselineRevision: sha256Hex(content),
        },
      ],
    };
    const taskDir = join(project.dir, 'tasks', 'brief');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      join(project.dir, 'tasks', 'index.yaml'),
      serializeTaskIndex({ tasks: [brief] }),
    );
    await writeFile(join(taskDir, 'task.yaml'), serializeTaskManifest(brief));
    await writeFile(join(taskDir, 'task.md'), initialTaskDocument(brief));
    await writeFile(join(taskDir, 'behaviour.md'), content);

    const contentState = async () =>
      Object.fromEntries(
        (await readTaskDocuments(project.engine, project.specId, 'brief')).documents.map(
          (document) => [document.path, document.contentState],
        ),
      );
    expect(await contentState()).toEqual({ 'task.md': 'baseline', 'behaviour.md': 'baseline' });

    // A registry change through the documents writer keeps the record (task.yaml is re-rendered).
    await applyTaskDocumentChange(
      project.engine,
      project.specId,
      'brief',
      randomUUID(),
      {
        action: 'rename',
        target: { kind: 'document', documentId: 'behaviour' },
        name: 'scenarios.md',
        expectedRevision: sha256Hex(content),
      },
      { sleep: noSleep },
    );
    const stored = parseTaskManifest(await readFile(join(taskDir, 'task.yaml'), 'utf8'), 'brief');
    expect(stored.documents[1]).toEqual({
      id: 'behaviour',
      path: 'scenarios.md',
      type: 'behaviour',
      baselineRevision: sha256Hex(content),
    });
    expect(await contentState()).toEqual({ 'task.md': 'baseline', 'scenarios.md': 'baseline' });
    await writeFile(join(taskDir, 'scenarios.md'), content + 'Given a written scenario.\n');
    // An edit by a person or an agent makes a document authored, task.md included.
    await writeFile(join(taskDir, 'task.md'), initialTaskDocument(brief) + 'Scope: the login.\n');
    expect(await contentState()).toEqual({ 'task.md': 'authored', 'scenarios.md': 'authored' });
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
