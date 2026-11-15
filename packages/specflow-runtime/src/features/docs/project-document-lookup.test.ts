import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { openProjectDocumentLookup } from './project-document-lookup';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const hub = (id: string, status = 'current') =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id} title\nstatus: ${status}\n${
    status === 'superseded' ? 'superseded_by: guide\n' : ''
  }---\n\n# ${id}\n`;

async function checkout(files: Record<string, string>, config?: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-doc-lookup-')));
  roots.push(root);
  await mkdir(join(root, 'docs'));
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, 'docs', path), content);
  }

  if (config !== undefined) {
    await mkdir(join(root, '.nevo'));
    await writeFile(join(root, '.nevo/config.yaml'), config);
  }

  return root;
}

describe('openProjectDocumentLookup', () => {
  it('resolves the active documents of the checkout, read on the first lookup only', async () => {
    const root = await checkout({
      'guide.md': hub('guide'),
      'old.md': hub('old', 'superseded'),
      'docs.yaml': '',
    });
    let reads = 0;
    const lookup = openProjectDocumentLookup(() => {
      reads += 1;

      return root;
    })();
    expect(reads).toBe(0);

    await expect(lookup('guide')).resolves.toBe(true);
    await expect(lookup('old')).resolves.toBe(false);
    await expect(lookup('missing')).resolves.toBe(false);
    expect(reads).toBe(1);
  });

  it('resolves nothing without a checkout or with invalid documentation settings', async () => {
    await expect(openProjectDocumentLookup(() => undefined)()('guide')).resolves.toBe(false);

    const invalid = await checkout({ 'guide.md': hub('guide') }, 'docs:\n  root: 42\n');
    await expect(openProjectDocumentLookup(() => invalid)()('guide')).resolves.toBe(false);
  });
});
