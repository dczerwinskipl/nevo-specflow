// Filesystem integration (no Git operations of its own): the typed document read of the workflow gates.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readRegisteredDocumentsOfType } from '../../src/specs/documents/document-reader';
import {
  GIT_OFF,
  documentsProject,
  handBuiltSpecification,
  removeTrackedRoots,
} from '../support/documents-fixture';

afterEach(removeTrackedRoots);

describe('readRegisteredDocumentsOfType', () => {
  it('lists the documents of one type in registry order, with text, missing and unreadable files', async () => {
    const fixture = await documentsProject(GIT_OFF);
    const spec = await handBuiltSpecification(fixture, {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'second', path: 'b.md', type: 'research' },
        { id: 'note', path: 'note.md', type: 'note' },
        { id: 'first', path: 'a.md', type: 'research' },
        { id: 'gone', path: 'gone.md', type: 'research' },
        { id: 'folder', path: 'folder.md', type: 'research' },
      ],
      files: {
        'overview.md': '# Overview\n',
        'b.md': '## Findings\n',
        'note.md': '# Note\n',
        'a.md': '# A\n',
      },
    });
    // Registered, but not a regular file: it exists and cannot be read.
    await mkdir(join(spec.dir, 'folder.md'));

    await expect(
      readRegisteredDocumentsOfType(
        fixture.engine,
        { kind: 'specification', specId: spec.specId },
        'research',
      ),
    ).resolves.toEqual([
      { id: 'second', present: true, text: '## Findings\n' },
      { id: 'first', present: true, text: '# A\n' },
      { id: 'gone', present: false },
      { id: 'folder', present: true, unreadable: true },
    ]);
  }, 240000);
});
