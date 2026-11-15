import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { createDocsChunkSource } from '../semantic-index/chunk-source';
import { readArticle } from './article';
import { projectDocsTree } from './tree';

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-reader-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'docs', 'ideas'), { recursive: true });
const write = (file: string, text: string) => writeFileSync(join(root, 'docs', file), text);
const doc = (id: string, extra = '', body = `# ${id}\n\nText.`) =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id} title\nstatus: current\n${extra}---\n\n${body}\n`;

write(
  'README.md',
  doc('readme', 'related: [guide, old, bad, nowhere]\n', 'Intro.\n\n# Top\n\n## Part\n\nx'),
);
write('guide.md', doc('guide', 'summary: How to.\n'));
write(
  'old.md',
  '---\nid: old\ntype: hub\ntitle: Old\nstatus: superseded\nsuperseded_by: guide\n---\n\nOld.\n',
);
write('ideas/idea.md', doc('idea'));
write('bad.md', doc('bad', 'scope: nope\n'));
const SETTINGS = 'proposals: [ideas]\ntaxonomy:\n  scopes: [repo]\n';
write('docs.yaml', SETTINGS);

const corpus = () => openFileSystemCorpus(root, parseDocsConfig({ root: 'docs' }));
const load = () => createDocsChunkSource({ corpus: corpus() }).load();

describe('projectDocsTree', () => {
  it('lists active, inactive and skipped documents relative to docs.root', async () => {
    const tree = projectDocsTree(await load(), 'docs');
    expect(tree.rootIndexDocumentId).toBe('readme');
    expect(tree.documents.map((d) => [d.documentId, d.path, d.proposal])).toEqual([
      ['guide', 'guide.md', false],
      ['idea', 'ideas/idea.md', true],
      ['readme', 'README.md', false],
    ]);
    expect(tree.documents[0]).toMatchObject({ summary: 'How to.', title: 'guide title' });
    expect(tree.inactive).toEqual([
      { documentId: 'old', path: 'old.md', status: 'superseded', supersededBy: 'guide' },
    ]);
    expect(tree.skipped.map((s) => s.path)).toEqual(['bad.md']);
  });
});

describe('readArticle', () => {
  it('returns the body without frontmatter, body-relative section lines and related states', async () => {
    const article = await readArticle(corpus(), await load(), 'readme');
    if (article.kind !== 'active') {
      throw new Error(article.kind);
    }

    expect(article.body.startsWith('Intro.')).toBe(true);
    expect(article.body).not.toContain('id: readme');
    expect(article.sections).toEqual([
      { sectionId: '_top', headingPath: [], line: 1 },
      { sectionId: 'top', headingPath: ['Top'], line: 3 },
      { sectionId: 'top/part', headingPath: ['Top', 'Part'], line: 5 },
    ]);
    expect(article.document.related).toEqual([
      { documentId: 'guide', title: 'guide title', state: 'active' },
      { documentId: 'old', title: 'Old', state: 'inactive' },
      { documentId: 'bad', state: 'skipped' },
      { documentId: 'nowhere', state: 'missing' },
    ]);
    expect(article.document.path).toBe('README.md');
  });

  it('answers inactive, skipped and unknown ids without a body', async () => {
    const snapshot = await load();
    expect(await readArticle(corpus(), snapshot, 'old')).toMatchObject({
      kind: 'inactive',
      status: 'superseded',
      supersededBy: { documentId: 'guide', title: 'guide title' },
    });
    expect(await readArticle(corpus(), snapshot, 'bad')).toMatchObject({
      kind: 'skipped',
      skipped: [{ path: 'bad.md' }],
    });
    expect(await readArticle(corpus(), snapshot, 'nope')).toMatchObject({ kind: 'not-found' });
  });

  it('is not-found for a file edited after the snapshot, and counts CRLF body lines', async () => {
    write(
      'crlf.md',
      '---\r\nid: crlf\r\ntype: hub\r\ntitle: Crlf\r\nstatus: current\r\n---\r\n\r\nIntro.\r\n\r\n# Head\r\n',
    );
    const snapshot = await load();
    expect(await readArticle(corpus(), snapshot, 'crlf')).toMatchObject({
      kind: 'active',
      sections: [{}, { sectionId: 'head', line: 3 }],
    });

    write('crlf.md', doc('crlf'));
    expect(await readArticle(corpus(), snapshot, 'crlf')).toMatchObject({ kind: 'not-found' });
  });
});

describe('DocsChunks.revision', () => {
  it('changes with a dirty edit and with settings alone', async () => {
    const source = createDocsChunkSource({ corpus: corpus() });
    const first = (await source.load()).revision;
    expect((await source.load()).revision).toBe(first);

    write('guide.md', doc('guide', 'summary: How to.\n', '# guide\n\nEdited.'));
    const edited = (await source.load()).revision;
    expect(edited).not.toBe(first);

    // The same files under other settings.
    write('docs.yaml', 'proposals: [ideas, guide.md]\ntaxonomy:\n  scopes: [repo]\n');
    const settingsOnly = (await createDocsChunkSource({ corpus: corpus() }).load()).revision;
    expect(settingsOnly).not.toBe(edited);
    write('docs.yaml', SETTINGS);
    expect((await createDocsChunkSource({ corpus: corpus() }).load()).revision).toBe(edited);
  });
});
