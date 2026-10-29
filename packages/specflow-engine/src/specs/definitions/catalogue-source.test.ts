import { describe, expect, it } from 'vitest';

import {
  createCatalogueSource,
  loadStableProjectCatalogue,
  type CatalogueSource,
} from './catalogue-source';
import { CATALOGUE_MEMO_MAX_HOMES, SIGNATURE_ENTRIES_MAX } from './limits';
import { computeStatSignature } from './signature';
import type { DefinitionSource } from './source';
import {
  archetypeFile,
  documentTypeFile,
  sampleProject,
  MemoryDefinitionSource,
} from './test-support';

/** The memory source stamps files around 1 s after the epoch, so "now" far beyond is old. */
const LONG_AFTER_MS = 10_000_000;

function setup(options: { nowMs?: number } = {}) {
  const source = sampleProject();
  const clock = { nowMs: options.nowMs ?? LONG_AFTER_MS };
  const catalogues: CatalogueSource = createCatalogueSource({
    sourceFor: () => source,
    nowMs: () => clock.nowMs,
  });
  return { source, clock, catalogues };
}

describe('catalogue source stat memo', () => {
  it('serves an unchanged tree from the memo without reading any file', async () => {
    const { source, catalogues } = setup();
    const first = await catalogues.get('/home');
    const reads = source.calls.read;
    const second = await catalogues.get('/home');
    expect(source.calls.read).toBe(reads);
    expect(second.catalogue.revision).toBe(first.catalogue.revision);
    expect(second.unstableRead).toBe(false);
    expect(first.catalogue.archetypes.map((archetype) => archetype.id)).toEqual(['minimal']);
  });

  it('reloads when a file is edited, added or deleted', async () => {
    const { source, catalogues } = setup();
    const before = (await catalogues.get('/home')).catalogue.revision;

    source.set('document-type/note.yaml', documentTypeFile('note', { title: 'Notes' }));
    const edited = (await catalogues.get('/home')).catalogue.revision;
    expect(edited).not.toBe(before);

    source.set('specification-archetype/second.yaml', archetypeFile('second'));
    const added = await catalogues.get('/home');
    expect(added.catalogue.archetypes.map((archetype) => archetype.id)).toEqual([
      'minimal',
      'second',
    ]);

    source.delete('specification-archetype/second.yaml');
    const deleted = await catalogues.get('/home');
    expect(deleted.catalogue.archetypes.map((archetype) => archetype.id)).toEqual(['minimal']);
    expect(deleted.catalogue.revision).toBe(edited);
  });

  it('notices a rewrite that keeps size and mtime but moves the ctime', async () => {
    const { source, catalogues } = setup();
    const first = await catalogues.get('/home');
    const note = source.text('document-type/note.yaml') ?? '';
    // Same size, new ino/ctime stamp: only the memo key can tell.
    source.set('document-type/note.yaml', note.replace('Note', 'Nope'));
    const second = await catalogues.get('/home');
    expect(second.catalogue.revision).not.toBe(first.catalogue.revision);
  });

  it('never trusts a tree modified within the last 2 seconds', async () => {
    // The files were stamped about 1.0 s after the epoch; "now" is 1.5 s.
    const { source, clock, catalogues } = setup({ nowMs: 1500 });
    await catalogues.get('/home');
    const afterFirst = source.calls.read;
    await catalogues.get('/home');
    expect(source.calls.read).toBeGreaterThan(afterFirst);

    // Once the files are older than the window at load time, the memo is trusted.
    clock.nowMs = 10_000;
    await catalogues.get('/home'); // reloads, now old enough to trust
    const trustedAt = source.calls.read;
    await catalogues.get('/home');
    expect(source.calls.read).toBe(trustedAt);
  });

  it('keeps one memo per Project Home and bounds the number of homes', async () => {
    const sources = new Map<string, MemoryDefinitionSource>();
    const catalogues = createCatalogueSource({
      sourceFor: (home) => {
        let found = sources.get(home);
        if (!found) {
          found = sampleProject();
          sources.set(home, found);
        }
        return found;
      },
      nowMs: () => LONG_AFTER_MS,
    });
    for (let index = 0; index <= CATALOGUE_MEMO_MAX_HOMES; index += 1) {
      await catalogues.get(`/home-${index}`);
    }
    const oldest = sources.get('/home-0')!;
    const newest = sources.get(`/home-${CATALOGUE_MEMO_MAX_HOMES}`)!;
    const oldestReads = oldest.calls.read;
    const newestReads = newest.calls.read;
    await catalogues.get('/home-0');
    await catalogues.get(`/home-${CATALOGUE_MEMO_MAX_HOMES}`);
    expect(oldest.calls.read).toBeGreaterThan(oldestReads); // evicted: loaded again
    expect(newest.calls.read).toBe(newestReads); // still memoised
  });

  it('clears the memo', async () => {
    const { source, catalogues } = setup();
    await catalogues.get('/home');
    catalogues.clear();
    const reads = source.calls.read;
    await catalogues.get('/home');
    expect(source.calls.read).toBeGreaterThan(reads);
  });

  describe('a tree that changes while it is loaded', () => {
    /** A source whose files are touched on every read: the signature never settles. */
    function churning(source: MemoryDefinitionSource, enabled: { on: boolean }): DefinitionSource {
      return {
        list: (directory, max) => source.list(directory, max),
        stat: (path) => source.stat(path),
        read: async (path, max) => {
          const outcome = await source.read(path, max);
          if (enabled.on) source.touch('document-type/note.yaml');
          return outcome;
        },
      };
    }

    it('serves the last good catalogue flagged unstable after 3 attempts', async () => {
      const base = sampleProject();
      const enabled = { on: false };
      const catalogues = createCatalogueSource({
        sourceFor: () => churning(base, enabled),
        nowMs: () => LONG_AFTER_MS,
      });
      const good = await catalogues.get('/home');
      expect(good.unstableRead).toBe(false);

      base.set('document-type/note.yaml', documentTypeFile('note', { title: 'Edited' }));
      enabled.on = true;
      const readsBefore = base.calls.read;
      const unstable = await catalogues.get('/home');
      expect(unstable.unstableRead).toBe(true);
      expect(unstable.catalogue.revision).toBe(good.catalogue.revision);
      // 3 attempts, each reading the 4 files of the sample project.
      expect(base.calls.read - readsBefore).toBe(3 * 4);
    });

    it('without a last good catalogue serves the last load flagged unstable and does not memoise it', async () => {
      const base = sampleProject();
      const enabled = { on: true };
      const catalogues = createCatalogueSource({
        sourceFor: () => churning(base, enabled),
        nowMs: () => LONG_AFTER_MS,
      });
      const first = await catalogues.get('/home');
      expect(first.unstableRead).toBe(true);
      enabled.on = false;
      const settled = await catalogues.get('/home');
      expect(settled.unstableRead).toBe(false);
    });
  });

  describe('archetype lookup for the tree reader', () => {
    it('answers absent with one stat and no directory walk', async () => {
      const { source, catalogues } = setup();
      const lists = source.calls.list;
      expect(await catalogues.lookupArchetype('/home', 'ghost')).toEqual({ state: 'absent' });
      expect(source.calls.list).toBe(lists);
      expect(source.calls.read).toBe(0);
    });

    it('answers defined from the memo without walking or reading', async () => {
      const { source, catalogues } = setup();
      await catalogues.get('/home');
      const lists = source.calls.list;
      const reads = source.calls.read;
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toEqual({
        state: 'defined',
        title: 'Minimal',
      });
      expect(source.calls.list).toBe(lists);
      expect(source.calls.read).toBe(reads);
    });

    it('loads once when the memo does not know the file yet, then answers from the memo', async () => {
      const { source, catalogues } = setup();
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toMatchObject({
        state: 'defined',
      });
      const lists = source.calls.list;
      await catalogues.lookupArchetype('/home', 'minimal');
      expect(source.calls.list).toBe(lists);
    });

    it('answers invalid for a file that exists but is not in the catalogue', async () => {
      const { source, catalogues } = setup();
      source.set('specification-archetype/broken.yaml', 'x: [');
      expect(await catalogues.lookupArchetype('/home', 'broken')).toEqual({ state: 'invalid' });
      source.setSymlink('specification-archetype/linked.yaml');
      expect(await catalogues.lookupArchetype('/home', 'linked')).toEqual({ state: 'invalid' });
    });

    it('notices a broken dependency and its repair without a full read in between', async () => {
      const { source, catalogues } = setup();
      await catalogues.get('/home');
      const note = source.text('document-type/note.yaml') ?? '';

      // The archetype file is untouched; one of the document types it templates is gone.
      source.delete('document-type/note.yaml');
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toEqual({ state: 'invalid' });
      const lists = source.calls.list;
      const reads = source.calls.read;
      // Nothing changed since: the memo answers again from its dependency keys alone.
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toEqual({ state: 'invalid' });
      expect(source.calls.list).toBe(lists);
      expect(source.calls.read).toBe(reads);

      source.set('document-type/note.yaml', note);
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toEqual({
        state: 'defined',
        title: 'Minimal',
      });
    });

    it('notices an edited template file and a changed document type title', async () => {
      const { source, catalogues } = setup();
      const before = (await catalogues.get('/home')).catalogue.revision;
      await catalogues.lookupArchetype('/home', 'minimal');
      source.set('specification-archetype/templates/overview.md', '# Changed {{slug}}\n');
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toMatchObject({
        state: 'defined',
      });
      expect((await catalogues.get('/home')).catalogue.revision).not.toBe(before);

      source.set('document-type/overview.yaml', documentTypeFile('overview', { title: 'Summary' }));
      await catalogues.lookupArchetype('/home', 'minimal');
      expect((await catalogues.get('/home')).catalogue.findDocumentType('overview')?.title).toBe(
        'Summary',
      );
    });

    it('does not trust the memo for a lookup while the files are younger than the window', async () => {
      const { source, catalogues } = setup({ nowMs: 1500 });
      await catalogues.get('/home');
      const reads = source.calls.read;
      await catalogues.lookupArchetype('/home', 'minimal');
      expect(source.calls.read).toBeGreaterThan(reads);
    });

    it('sees an edit of the archetype file made after the memo was filled', async () => {
      const { source, catalogues } = setup();
      await catalogues.get('/home');
      source.set('specification-archetype/minimal.yaml', 'x: [');
      expect(await catalogues.lookupArchetype('/home', 'minimal')).toEqual({ state: 'invalid' });
    });
  });
});

describe('stat signature', () => {
  it('is stable for an unchanged tree and changes with any entry', async () => {
    const source = sampleProject();
    const first = await computeStatSignature(source);
    expect((await computeStatSignature(source)).value).toBe(first.value);
    expect(first.complete).toBe(true);
    expect([...first.fileKeys.keys()]).toContain('document-type/note.yaml');

    source.touch('document-type/note.yaml');
    const touched = await computeStatSignature(source);
    expect(touched.value).not.toBe(first.value);
    expect(touched.newestChangeMs).toBeGreaterThan(first.newestChangeMs);

    source.delete('document-type/note.yaml');
    expect((await computeStatSignature(source)).value).not.toBe(touched.value);
  });

  it('includes the template folder and sees a folder turn into a link', async () => {
    const source = sampleProject();
    const before = await computeStatSignature(source);
    source.set('specification-archetype/templates/extra.md', 'x');
    const added = await computeStatSignature(source);
    expect(added.value).not.toBe(before.value);

    source.setUnsafeDirectory('document-type');
    const linked = await computeStatSignature(source);
    expect(linked.value).not.toBe(added.value);
    expect(linked.complete).toBe(true);
  });

  it('is incomplete, so never trusted, when a directory cannot be read or the tree is too big', async () => {
    const source = sampleProject();
    const unreadable: DefinitionSource = {
      list: (directory, max) =>
        directory === 'document-type'
          ? Promise.resolve({ state: 'unreadable' })
          : source.list(directory, max),
      read: (path, max) => source.read(path, max),
      stat: (path) => source.stat(path),
    };
    expect((await computeStatSignature(unreadable)).complete).toBe(false);

    const big = new MemoryDefinitionSource();
    for (let index = 0; index <= SIGNATURE_ENTRIES_MAX; index += 1) {
      big.set(`document-type/f${index}.yaml`, 'x');
    }
    expect((await computeStatSignature(big)).complete).toBe(false);
  });

  it('describes an absent tree', async () => {
    const empty = await computeStatSignature(new MemoryDefinitionSource());
    expect(empty).toMatchObject({ complete: true, newestChangeMs: 0 });
  });
});

describe('stable read for a mutation', () => {
  function churning(source: MemoryDefinitionSource, enabled: { on: boolean }): DefinitionSource {
    return {
      list: (directory, max) => source.list(directory, max),
      stat: (path) => source.stat(path),
      read: async (path, max) => {
        const outcome = await source.read(path, max);
        if (enabled.on) source.touch('document-type/note.yaml');
        return outcome;
      },
    };
  }

  it('returns a settled catalogue at once', async () => {
    const { catalogues } = setup();
    const waits: number[] = [];
    const result = await loadStableProjectCatalogue(catalogues, '/home', {
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(result.unstableRead).toBe(false);
    expect(waits).toEqual([]);
  });

  it('loads again after a pause when the first read was unstable, and succeeds once the files settle', async () => {
    const base = sampleProject();
    const enabled = { on: true };
    const catalogues = createCatalogueSource({
      sourceFor: () => churning(base, enabled),
      nowMs: () => LONG_AFTER_MS,
    });
    const waits: number[] = [];
    const result = await loadStableProjectCatalogue(catalogues, '/home', {
      attempts: 3,
      delayMs: 7,
      sleep: (ms) => {
        waits.push(ms);
        enabled.on = false; // the writer finished during the pause
        return Promise.resolve();
      },
    });
    expect(result.unstableRead).toBe(false);
    expect(waits).toEqual([7]);
  });

  it('refuses with CATALOGUE_STALE (catalogue-unstable) when the files never settle', async () => {
    const base = sampleProject();
    const catalogues = createCatalogueSource({
      sourceFor: () => churning(base, { on: true }),
      nowMs: () => LONG_AFTER_MS,
    });
    const waits: number[] = [];
    await expect(
      loadStableProjectCatalogue(catalogues, '/home', {
        attempts: 3,
        delayMs: 5,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      }),
    ).rejects.toMatchObject({ code: 'CATALOGUE_STALE', details: { cause: 'catalogue-unstable' } });
    expect(waits).toEqual([5, 5]);
  });
});
