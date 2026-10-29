// Real-filesystem tests of the definitions layer: the filesystem source (hostile entries), the stat
// memo against real timestamps, the atomic writer and `install` against a project directory. Every
// capability the platform may lack (symlinks, FIFOs, hard links, permission bits) is probed first and
// its tests are skipped when it is missing.
import { execFileSync } from 'node:child_process';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFINITIONS_RELATIVE_PATH,
  createCatalogueSource,
  createDefaultDefinitionRegistry,
  createFilesystemDefinitionSource,
  createFilesystemDefinitionWriter,
  getProjectCatalogue,
  installDefinitions,
  installProjectDefinitionFiles,
  loadDefinitions,
  openSeedSource,
  type DefinitionSource,
} from '../../src/specs/definitions';
import { documentTypeFile, sampleProject } from '../../src/specs/definitions/test-support';

const registry = createDefaultDefinitionRegistry();

let scratch: string;
let canSymlink = false;
let canHardLink = false;
let canFifo = false;
let canDenyRead = false;

async function probeCapabilities(): Promise<void> {
  const target = join(scratch, 'probe-target');
  await writeFile(target, 'x');
  try {
    await symlink(target, join(scratch, 'probe-link'));
    canSymlink = true;
  } catch {
    canSymlink = false;
  }

  try {
    await link(target, join(scratch, 'probe-hard'));
    canHardLink = true;
  } catch {
    canHardLink = false;
  }

  try {
    const fifo = join(scratch, 'probe-fifo');
    execFileSync('mkfifo', [fifo], { stdio: 'ignore' });
    // Some shells emulate mkfifo with a different kind of file: only a real FIFO counts.
    canFifo = (await lstat(fifo)).isFIFO();
  } catch {
    canFifo = false;
  }

  try {
    const denied = join(scratch, 'probe-denied');
    await writeFile(denied, 'x');
    await chmod(denied, 0o000);
    try {
      await readFile(denied);
      canDenyRead = false; // running as root, or the platform ignores the bits
    } catch {
      canDenyRead = true;
    }

    await chmod(denied, 0o600);
  } catch {
    canDenyRead = false;
  }
}

beforeAll(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'nevo-defs-')));
  await probeCapabilities();
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

let counter = 0;
async function newHome(): Promise<string> {
  counter += 1;
  const home = join(scratch, `home-${counter}`);
  await mkdir(home, { recursive: true });

  return home;
}

function definitionsRoot(home: string): string {
  return join(home, ...DEFINITIONS_RELATIVE_PATH.split('/'));
}

async function writeProject(home: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const full = join(definitionsRoot(home), ...path.split('/'));
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
}

function sampleFiles(): Record<string, string> {
  const memory = sampleProject();

  return Object.fromEntries(memory.paths().map((path) => [path, memory.text(path) ?? '']));
}

function problemCodes(result: Awaited<ReturnType<typeof loadDefinitions>>): string[] {
  return result.problems.map((problem) => `${problem.source}:${problem.code}`);
}

describe('filesystem source', () => {
  it('lists, reads and stats a real tree', async () => {
    const home = await newHome();
    await writeProject(home, sampleFiles());
    const source = createFilesystemDefinitionSource(definitionsRoot(home));

    const root = await source.list('', 100);
    expect(root.state).toBe('ok');
    if (root.state === 'ok') {
      expect(root.entries.map((entry) => [entry.name, entry.type]).sort()).toEqual([
        ['document-type', 'directory'],
        ['specification-archetype', 'directory'],
      ]);
    }

    const read = await source.read('document-type/note.yaml', 100_000);
    expect(read.state === 'ok' && read.bytes.toString('utf8')).toContain('id: note');
    const stats = await source.stat('document-type/note.yaml');
    expect(stats).toMatchObject({ state: 'ok', entry: { name: 'note.yaml', type: 'file' } });
  });

  it('answers absent for what is not there, including the whole tree', async () => {
    const home = await newHome();
    const source = createFilesystemDefinitionSource(definitionsRoot(home));
    expect(await source.list('', 10)).toEqual({ state: 'absent' });
    expect(await source.read('document-type/x.yaml', 10)).toEqual({ state: 'absent' });
    expect(await source.stat('document-type/x.yaml')).toEqual({ state: 'absent' });
    expect(await loadDefinitions(source, registry)).toMatchObject({
      rootPresent: false,
      problems: [],
    });
  });

  it('refuses a file above the limit without reading it whole, and paths that leave the tree', async () => {
    const home = await newHome();
    await writeProject(home, { 'document-type/big.yaml': 'x'.repeat(1000) });
    const source = createFilesystemDefinitionSource(definitionsRoot(home));
    expect(await source.read('document-type/big.yaml', 999)).toEqual({ state: 'too-large' });
    expect((await source.read('document-type/big.yaml', 1000)).state).toBe('ok');
    for (const path of [
      '../x',
      'document-type/../../x',
      '/etc/passwd',
      'document-type\\big.yaml',
    ]) {
      expect((await source.read(path, 10)).state, path).toBe('unsafe');
    }

    expect((await source.read('document-type', 10)).state).toBe('not-regular');
  });

  it('reports a directory with more entries than allowed as overflowing', async () => {
    const home = await newHome();
    const files: Record<string, string> = {};
    for (let index = 0; index < 30; index += 1) {
      files[`document-type/f${index}.yaml`] = 'x';
    }

    await writeProject(home, files);
    const source = createFilesystemDefinitionSource(definitionsRoot(home));
    expect(await source.list('document-type', 29)).toEqual({ state: 'overflow' });
    expect((await source.list('document-type', 30)).state).toBe('ok');
  });

  it('loads hundreds of definition files in name order within the limits', async () => {
    const home = await newHome();
    const files = sampleFiles();
    for (let index = 0; index < 90; index += 1) {
      const id = `t${String(index).padStart(3, '0')}`;
      files[`document-type/${id}.yaml`] = documentTypeFile(id);
    }

    await writeProject(home, files);
    const result = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(home)),
      registry,
    );
    expect(result.problems).toEqual([]);
    expect(result.definitions.get('document-type')?.size).toBe(92);
  });

  it('reports an unreadable file and still loads the others', async (context) => {
    if (!canDenyRead) {
      return context.skip();
    }

    const home = await newHome();
    await writeProject(home, sampleFiles());
    const target = join(definitionsRoot(home), 'document-type', 'note.yaml');
    await chmod(target, 0o000);
    try {
      const result = await loadDefinitions(
        createFilesystemDefinitionSource(definitionsRoot(home)),
        registry,
      );
      expect(problemCodes(result)).toContain('document-type/note.yaml:file-unreadable');
      expect(result.definitions.get('document-type')?.has('overview')).toBe(true);
    } finally {
      await chmod(target, 0o600);
    }
  });
});

describe('hostile entries', () => {
  // `describe.skipIf` is evaluated at collection time, before the probes ran: each test checks its own capability.
  it('does not follow a symlinked definition file', async (context) => {
    if (!canSymlink) {
      return context.skip();
    }

    const home = await newHome();
    await writeProject(home, sampleFiles());
    const outside = join(scratch, 'outside.yaml');
    await writeFile(outside, documentTypeFile('outside'));
    await symlink(outside, join(definitionsRoot(home), 'document-type', 'outside.yaml'));
    const result = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(home)),
      registry,
    );
    expect(problemCodes(result)).toEqual(['document-type/outside.yaml:directory-unsafe']);
    expect(result.definitions.get('document-type')?.has('outside')).toBe(false);
    expect(result.definitions.get('document-type')?.has('note')).toBe(true);
  });

  it('does not follow a symlinked kind directory or definitions root', async (context) => {
    if (!canSymlink) {
      return context.skip();
    }

    const outside = join(scratch, 'outside-tree');
    await mkdir(join(outside, 'document-type'), { recursive: true });
    await writeFile(join(outside, 'document-type', 'overview.yaml'), documentTypeFile('overview'));

    const kindHome = await newHome();
    await mkdir(definitionsRoot(kindHome), { recursive: true });
    await symlink(
      join(outside, 'document-type'),
      join(definitionsRoot(kindHome), 'document-type'),
      'junction',
    );
    const kindResult = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(kindHome)),
      registry,
    );
    expect(problemCodes(kindResult)).toContain('document-type:directory-unsafe');
    expect(kindResult.definitions.get('document-type')?.size).toBe(0);

    const rootHome = await newHome();
    await mkdir(join(rootHome, '.nevo'), { recursive: true });
    await symlink(outside, definitionsRoot(rootHome), 'junction');
    const rootResult = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(rootHome)),
      registry,
    );
    expect(problemCodes(rootResult)).toEqual([':directory-unsafe']);
  });

  it('does not follow a symlinked template file or template folder', async (context) => {
    if (!canSymlink) {
      return context.skip();
    }

    const outside = join(scratch, 'outside-template.md');
    await writeFile(outside, '# outside\n');

    const fileHome = await newHome();
    await writeProject(fileHome, sampleFiles());
    const template = join(
      definitionsRoot(fileHome),
      'specification-archetype',
      'templates',
      'overview.md',
    );
    await rm(template);
    await symlink(outside, template);
    const fileResult = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(fileHome)),
      registry,
    );
    expect(problemCodes(fileResult)).toEqual([
      'specification-archetype/minimal.yaml:template-file-invalid',
    ]);

    const folderHome = await newHome();
    const files = sampleFiles();
    delete files['specification-archetype/templates/overview.md'];
    await writeProject(folderHome, files);
    const outsideDir = join(scratch, 'outside-templates');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, 'overview.md'), '# outside\n');
    await symlink(
      outsideDir,
      join(definitionsRoot(folderHome), 'specification-archetype', 'templates'),
      'junction',
    );
    const folderResult = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(folderHome)),
      registry,
    );
    expect(problemCodes(folderResult)).toContain(
      'specification-archetype/minimal.yaml:template-file-invalid',
    );
  });

  it('does not block on, or read, a FIFO', async (context) => {
    if (!canFifo) {
      return context.skip();
    }

    const home = await newHome();
    await writeProject(home, sampleFiles());
    execFileSync('mkfifo', [join(definitionsRoot(home), 'document-type', 'pipe.yaml')]);
    const result = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(home)),
      registry,
    );
    expect(problemCodes(result)).toEqual(['document-type/pipe.yaml:directory-unsafe']);
  });

  it('reads a hard-linked file as the regular file it is', async (context) => {
    if (!canHardLink) {
      return context.skip();
    }

    const home = await newHome();
    await writeProject(home, sampleFiles());
    const original = join(scratch, 'hard-original.yaml');
    await writeFile(original, documentTypeFile('hard'));
    await link(original, join(definitionsRoot(home), 'document-type', 'hard.yaml'));
    const result = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(home)),
      registry,
    );
    expect(result.problems).toEqual([]);
    expect(result.definitions.get('document-type')?.has('hard')).toBe(true);
  });
});

describe('catalogue stat memo against real timestamps', () => {
  function counting(source: DefinitionSource, counter: { reads: number }): DefinitionSource {
    return {
      list: (directory, max) => source.list(directory, max),
      stat: (path) => source.stat(path),
      read: (path, max) => {
        counter.reads += 1;

        return source.read(path, max);
      },
    };
  }

  it('serves a settled tree from the memo and notices an edit', async () => {
    const home = await newHome();
    await writeProject(home, sampleFiles());
    const counter = { reads: 0 };
    const catalogues = createCatalogueSource({
      sourceFor: () => counting(createFilesystemDefinitionSource(definitionsRoot(home)), counter),
      // The files were just written; a clock far ahead stands for "settled for more than 2 seconds".
      nowMs: () => Date.now() + 60_000,
    });
    const first = await catalogues.get(home);
    const reads = counter.reads;
    expect((await catalogues.get(home)).catalogue.revision).toBe(first.catalogue.revision);
    expect(counter.reads).toBe(reads);

    // A same-size rewrite with a different mtime: only the stat signature can notice it.
    const note = join(definitionsRoot(home), 'document-type', 'note.yaml');
    const text = await readFile(note, 'utf8');
    await writeFile(note, text.replace('Note', 'Nope'));
    const later = new Date(Date.now() + 5000);
    await utimes(note, later, later);
    const second = await catalogues.get(home);
    expect(second.catalogue.revision).not.toBe(first.catalogue.revision);
    expect(counter.reads).toBeGreaterThan(reads);
  });

  it('never trusts a tree changed within the last 2 seconds, with the real clock', async () => {
    const home = await newHome();
    await writeProject(home, sampleFiles());
    const counter = { reads: 0 };
    const catalogues = createCatalogueSource({
      sourceFor: () => counting(createFilesystemDefinitionSource(definitionsRoot(home)), counter),
    });
    await catalogues.get(home);
    const reads = counter.reads;
    await catalogues.get(home);
    expect(counter.reads).toBeGreaterThan(reads);
  });

  it('answers an archetype lookup with one stat on the real filesystem', async () => {
    const home = await newHome();
    await writeProject(home, sampleFiles());
    const catalogues = createCatalogueSource({ nowMs: () => Date.now() + 60_000 });
    expect(await catalogues.lookupArchetype(home, 'minimal')).toEqual({
      state: 'defined',
      title: 'Minimal',
    });
    expect(await catalogues.lookupArchetype(home, 'ghost')).toEqual({ state: 'absent' });
  });

  it('loads the project catalogue of an Engine home through the default source', async () => {
    const home = await newHome();
    await writeProject(home, sampleFiles());
    const result = await getProjectCatalogue({ context: { project: { homeRoot: home } } });
    expect(result.catalogue.archetypes.map((archetype) => archetype.id)).toEqual(['minimal']);
    expect(result.problems).toEqual([]);
  });
});

describe('install against a real project', () => {
  async function runInstall(home: string, options = {}) {
    const seed = (await openSeedSource()).source;

    return installDefinitions({
      seed,
      target: createFilesystemDefinitionSource(definitionsRoot(home)),
      writer: createFilesystemDefinitionWriter(home),
      registry,
      options,
    });
  }

  async function filesBelow(directory: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await filesBelow(path)).map((name) => `${entry.name}/${name}`));
      } else {
        out.push(entry.name);
      }
    }

    return out.sort();
  }

  it('bootstraps a project with no .nevo folder, leaves no staged file and is idempotent', async () => {
    const home = await newHome();
    const first = await runInstall(home);
    expect(first.written).toHaveLength(13);
    const files = await filesBelow(definitionsRoot(home));
    expect(files).toHaveLength(13);
    expect(files.some((name) => name.endsWith('.tmp'))).toBe(false);

    const loaded = await loadDefinitions(
      createFilesystemDefinitionSource(definitionsRoot(home)),
      registry,
    );
    expect(loaded.problems).toEqual([]);

    const second = await runInstall(home, { addMissing: true });
    expect(second.written).toEqual([]);
    expect(await runInstall(home).then((result) => result.outcome.status)).toBe('refused');
  });

  it('writes the template file with the shipped bytes', async () => {
    const home = await newHome();
    await runInstall(home, { targets: ['specification-archetype/minimal'] });
    const shipped = await readFile(
      join(
        (await openSeedSource()).directory,
        'specification-archetype',
        'templates',
        'overview.md',
      ),
    );
    const installed = await readFile(
      join(definitionsRoot(home), 'specification-archetype', 'templates', 'overview.md'),
    );
    expect(installed.equals(shipped)).toBe(true);
  });

  it('installs into a Project Home that the catalogue source then reads, with the pinned revision', async () => {
    const home = await newHome();
    const result = await installProjectDefinitionFiles(home);
    expect(result.written).toHaveLength(13);
    const project = await getProjectCatalogue({ context: { project: { homeRoot: home } } });
    expect(project.problems).toEqual([]);
    expect(project.catalogue.archetypes.map((archetype) => archetype.id)).toEqual([
      'architecture',
      'feature',
      'minimal',
    ]);
    expect(project.catalogue.revision).toBe(
      '900fd261f4bb33c4f816e81d8c002baad92c2b85429d6f2bfe2c24ac2bdfe6e4',
    );
  });

  it('lets three concurrent writers create the same folders and files without a spurious failure', async () => {
    const home = await newHome();
    const writer = createFilesystemDefinitionWriter(home);
    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        writer.writeAtomic('specification-archetype/templates/x.md', new Uint8Array([1])),
      ),
    );
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('creates a file exclusively: one that appeared since the plan is never replaced', async () => {
    const home = await newHome();
    const writer = createFilesystemDefinitionWriter(home);
    await writer.writeAtomic('document-type/note.yaml', new Uint8Array([1]), { exclusive: true });
    await expect(
      writer.writeAtomic('document-type/note.yaml', new Uint8Array([2]), { exclusive: true }),
    ).rejects.toThrow(/appeared/u);
    expect([
      ...(await readFile(join(definitionsRoot(home), 'document-type', 'note.yaml'))),
    ]).toEqual([1]);
    expect((await readdir(join(definitionsRoot(home), 'document-type'))).sort()).toEqual([
      'note.yaml',
    ]);
  });

  it('dry run touches nothing', async () => {
    const home = await newHome();
    await runInstall(home, { dryRun: true });
    await expect(stat(join(home, '.nevo'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to write through a symlinked definitions folder or file', async (context) => {
    if (!canSymlink) {
      return context.skip();
    }

    const outside = join(scratch, 'outside-install');
    await mkdir(outside, { recursive: true });

    const folderHome = await newHome();
    await mkdir(join(folderHome, '.nevo'), { recursive: true });
    await symlink(outside, definitionsRoot(folderHome), 'junction');
    // The install refuses before writing; the writer refuses on its own as well.
    const blocked = await runInstall(folderHome);
    expect(blocked.written).toEqual([]);
    expect(blocked.outcome).toMatchObject({ status: 'refused', reason: 'target-unsafe' });
    await expect(
      createFilesystemDefinitionWriter(folderHome).writeAtomic(
        'document-type/note.yaml',
        new Uint8Array(1),
      ),
    ).rejects.toThrow(/not a plain directory/u);
    expect(await readdir(outside)).toEqual([]);

    const fileHome = await newHome();
    await mkdir(join(definitionsRoot(fileHome), 'document-type'), { recursive: true });
    const target = join(scratch, 'outside-file.yaml');
    await writeFile(target, 'keep');
    await symlink(target, join(definitionsRoot(fileHome), 'document-type', 'note.yaml'));
    const result = await runInstall(fileHome, { targets: ['document-type/note'], force: true });
    expect(result.written).toEqual([]);
    expect(await readFile(target, 'utf8')).toBe('keep');
  });
});
