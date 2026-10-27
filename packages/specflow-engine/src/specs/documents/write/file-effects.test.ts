import { mkdirSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { onPosix, symlinksAvailable } from '../../../../test/support/platform';

import { sha256Hex } from '../../../hash';
import type { PlannedPath } from '../changes/plan/model';
import { DOCUMENT_TEMP_NAME_LENGTH } from './path-bound';
import {
  NOT_REGULAR,
  WriterInterrupted,
  applyPlannedPath,
  dispositionOf,
  ensureParentDirectories,
  nodeDocumentFileOps,
  observePath,
  isStageFileOf,
  removeStageFiles,
  stagedFileName,
  type ApplyPathContext,
  type DocumentFileOps,
} from './file-effects';

const OPERATION_ID = '3f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c35';
const DIRECTORY = 'specs/active/sample';
const TAG = 'abcde';

let specDir: string;
beforeEach(async () => {
  const root = await realpath(mkdtempSync(join(tmpdir(), 'specflow-effects-')));
  specDir = join(root, ...DIRECTORY.split('/'));
  await mkdir(specDir, { recursive: true });
});
afterEach(async () => {
  await rm(join(specDir, '..', '..', '..'), { recursive: true, force: true });
});

const state = (text: string) => ({ sha256: sha256Hex(text), bytes: Buffer.byteLength(text) });

function planned(path: string, pre: string | null, post: string | null): PlannedPath {
  return {
    path: `${DIRECTORY}/${path}`,
    role: 'document',
    pre: pre === null ? null : state(pre),
    post: post === null ? null : state(post),
    source: post === null ? { kind: 'none' } : { kind: 'payload' },
  };
}

function context(overrides: Partial<ApplyPathContext> = {}): ApplyPathContext {
  return {
    ops: nodeDocumentFileOps,
    specDir,
    directory: DIRECTORY,
    operationId: OPERATION_ID,
    executorTag: TAG,
    index: 0,
    ...overrides,
  };
}

const bytesOf = (text: string) => () => Promise.resolve(Buffer.from(text));

describe('observePath and dispositionOf', () => {
  it('reports a hash, an absent file and a directory', async () => {
    await writeFile(join(specDir, 'a.md'), 'abc');
    await mkdir(join(specDir, 'dir'));
    expect(await observePath(nodeDocumentFileOps, specDir, 'a.md')).toEqual(state('abc'));
    expect(await observePath(nodeDocumentFileOps, specDir, 'nope.md')).toBeNull();
    expect(await observePath(nodeDocumentFileOps, specDir, 'dir')).toBe(NOT_REGULAR);
  });

  it('judges post before pre and anything else foreign', () => {
    const path = planned('a.md', 'old', 'new');
    expect(dispositionOf(state('old'), path)).toBe('at-pre');
    expect(dispositionOf(state('new'), path)).toBe('at-post');
    expect(dispositionOf(state('other'), path)).toBe('foreign');
    expect(dispositionOf(NOT_REGULAR, path)).toBe('foreign');
    expect(dispositionOf(null, planned('b.md', null, 'x'))).toBe('at-pre');
    expect(dispositionOf(null, planned('b.md', 'x', null))).toBe('at-post');
  });
});

describe('stagedFileName', () => {
  const OTHER = '00000000-5c1d-4e7a-9b62-0d4e8f1a7c35';

  it('is short, deterministic and distinct per path, operation and executor', () => {
    const name = stagedFileName(OPERATION_ID, 0, TAG);
    expect(name.length).toBeLessThanOrEqual(DOCUMENT_TEMP_NAME_LENGTH);
    expect(stagedFileName(OPERATION_ID, 0, TAG)).toBe(name);
    expect(stagedFileName(OPERATION_ID, 1, TAG)).not.toBe(name);
    expect(stagedFileName(OPERATION_ID, 0, 'fffff')).not.toBe(name);
    expect(stagedFileName(OTHER, 0, TAG)).not.toBe(name);
    expect(stagedFileName(OPERATION_ID, 199, TAG, 'backup').length).toBeLessThanOrEqual(
      DOCUMENT_TEMP_NAME_LENGTH,
    );
  });

  it('is recognised as the operation own, for any executor and path, and nothing else is', () => {
    expect(isStageFileOf(OPERATION_ID, stagedFileName(OPERATION_ID, 7, 'fffff'))).toBe(true);
    expect(isStageFileOf(OPERATION_ID, stagedFileName(OPERATION_ID, 0, TAG, 'backup'))).toBe(true);
    expect(isStageFileOf(OPERATION_ID, stagedFileName(OTHER, 0, TAG))).toBe(false);
    expect(isStageFileOf(OPERATION_ID, 'notes.md')).toBe(false);
  });
});

describe('removeStageFiles', () => {
  it('removes the stage and backup files of the operation, of every executor, and leaves the rest', async () => {
    const mine = [
      stagedFileName(OPERATION_ID, 0, TAG),
      stagedFileName(OPERATION_ID, 3, 'fffff'),
      stagedFileName(OPERATION_ID, 0, TAG, 'backup'),
    ];
    const others = [stagedFileName('00000000-5c1d-4e7a-9b62-0d4e8f1a7c35', 0, TAG), 'keep.md'];
    for (const name of [...mine, ...others]) await writeFile(join(specDir, name), 'x');
    await removeStageFiles(nodeDocumentFileOps, specDir, OPERATION_ID);
    expect((await readdir(specDir)).sort()).toEqual([...others].sort());
    await removeStageFiles(nodeDocumentFileOps, join(specDir, 'missing'), OPERATION_ID);
  });
});

describe('applyPlannedPath', () => {
  it('creates a file in a new folder and leaves no stage file', async () => {
    const path = planned('new/deep/a.md', null, 'hello');
    expect(await applyPlannedPath(context(), path, bytesOf('hello'))).toEqual({ kind: 'applied' });
    expect(await readFile(join(specDir, 'new', 'deep', 'a.md'), 'utf8')).toBe('hello');
    expect(await readdir(join(specDir, 'new', 'deep'))).toEqual(['a.md']);
  });

  it('replaces a file at its pre state and removes one', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    await writeFile(join(specDir, 'b.md'), 'bye');
    expect(
      await applyPlannedPath(context(), planned('a.md', 'old', 'new'), bytesOf('new')),
    ).toEqual({ kind: 'applied' });
    expect(await applyPlannedPath(context(), planned('b.md', 'bye', null), bytesOf(''))).toEqual({
      kind: 'applied',
    });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('new');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('never writes a path that is already in place', async () => {
    await writeFile(join(specDir, 'a.md'), 'new');
    let asked = false;
    const outcome = await applyPlannedPath(context(), planned('a.md', 'old', 'new'), () => {
      asked = true;
      return Promise.resolve(Buffer.from('new'));
    });
    expect(outcome).toEqual({ kind: 'already' });
    expect(asked).toBe(false);
  });

  it('refuses a foreign file without touching it', async () => {
    await writeFile(join(specDir, 'a.md'), 'someone else');
    expect(
      await applyPlannedPath(context(), planned('a.md', 'old', 'new'), bytesOf('new')),
    ).toEqual({ kind: 'foreign' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('someone else');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('withdraws the stage file when the target changes between the check and the replacement', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const ops: DocumentFileOps = {
      ...nodeDocumentFileOps,
      writeStaged: async (path, bytes) => {
        await nodeDocumentFileOps.writeStaged(path, bytes);
        await writeFile(join(specDir, 'a.md'), 'edited meanwhile');
      },
    };
    const outcome = await applyPlannedPath(
      context({ ops }),
      planned('a.md', 'old', 'new'),
      bytesOf('new'),
    );
    expect(outcome).toEqual({ kind: 'foreign' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('edited meanwhile');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('removes the stage file when the replacement fails, and reports the failure', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const ops: DocumentFileOps = {
      ...nodeDocumentFileOps,
      rename: () => Promise.reject(Object.assign(new Error('disk full'), { code: 'ENOSPC' })),
    };
    await expect(
      applyPlannedPath(context({ ops }), planned('a.md', 'old', 'new'), bytesOf('new')),
    ).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('old');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('leaves the stage file of a process that died, and replaces it on the next run', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const path = planned('a.md', 'old', 'new');
    await expect(
      applyPlannedPath(
        context({
          observe: (event) =>
            event.kind === 'staged'
              ? Promise.reject(new WriterInterrupted('staged'))
              : Promise.resolve(),
        }),
        path,
        bytesOf('new'),
      ),
    ).rejects.toBeInstanceOf(WriterInterrupted);
    const left = (await readdir(specDir)).filter((name) => name !== 'a.md');
    expect(left).toEqual([stagedFileName(OPERATION_ID, 0, TAG)]);
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('old');

    expect(await applyPlannedPath(context(), path, bytesOf('new'))).toEqual({ kind: 'applied' });
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('refuses content that is not the one the plan names', async () => {
    await expect(
      applyPlannedPath(context(), planned('a.md', null, 'right'), bytesOf('wrong')),
    ).rejects.toMatchObject({ code: 'DOCUMENT_RECOVERY_REQUIRED' });
    expect(await readdir(specDir)).toEqual([]);
  });

  it('reports each effect in order', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const seen: string[] = [];
    const observe = (event: { kind: string }) => {
      seen.push(event.kind);
      return Promise.resolve();
    };
    await applyPlannedPath(context({ observe }), planned('a.md', 'old', 'new'), bytesOf('new'));
    await applyPlannedPath(context({ observe }), planned('a.md', 'new', null), bytesOf(''));
    expect(seen).toEqual(['staged', 'before-replace', 'replaced', 'before-replace', 'removed']);
  });
});

describe('ensureParentDirectories', () => {
  it('creates missing folders and accepts existing ones', async () => {
    await mkdir(join(specDir, 'one'));
    await ensureParentDirectories(nodeDocumentFileOps, specDir, 'one/two/three.md');
    expect(readdirSync(join(specDir, 'one'))).toEqual(['two']);
    await ensureParentDirectories(nodeDocumentFileOps, specDir, 'one/two/three.md');
  });

  it('refuses a file where a folder is needed', async () => {
    await writeFile(join(specDir, 'one'), 'file');
    await expect(
      ensureParentDirectories(nodeDocumentFileOps, specDir, 'one/two.md'),
    ).rejects.toMatchObject({ code: 'SPEC_SOURCE_UNAVAILABLE' });
  });

  it.skipIf(!symlinksAvailable)('refuses a folder that is a link', async () => {
    const outside = join(specDir, '..', 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(specDir, 'linked'), 'dir');
    await expect(
      ensureParentDirectories(nodeDocumentFileOps, specDir, 'linked/a.md'),
    ).rejects.toMatchObject({ code: 'SPEC_SOURCE_UNAVAILABLE' });
    expect(basename(outside)).toBe('outside');
    expect(readdirSync(outside)).toEqual([]);
  });
});

describe('the backup check of a replacement', () => {
  const foreignWrite =
    (path: string, content: string) =>
    (event: { kind: string }): Promise<void> =>
      event.kind === 'before-replace' ? writeFile(path, content) : Promise.resolve();

  it('catches a write that lands in place after the second hash and puts it back', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const outcome = await applyPlannedPath(
      context({ observe: foreignWrite(join(specDir, 'a.md'), 'foreign write') }),
      planned('a.md', 'old', 'new'),
      bytesOf('new'),
    );
    expect(outcome).toEqual({ kind: 'foreign' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('foreign write');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('catches a write that lands in place before a removal and puts it back', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const outcome = await applyPlannedPath(
      context({ observe: foreignWrite(join(specDir, 'a.md'), 'foreign write') }),
      planned('a.md', 'old', null),
      bytesOf(''),
    );
    expect(outcome).toEqual({ kind: 'foreign' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('foreign write');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });

  it('leaves no backup after a clean replacement or removal', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    await writeFile(join(specDir, 'b.md'), 'bye');
    await applyPlannedPath(context(), planned('a.md', 'old', 'new'), bytesOf('new'));
    await applyPlannedPath(context(), planned('b.md', 'bye', null), bytesOf(''));
    expect((await readdir(specDir)).sort()).toEqual(['a.md']);
  });

  it.each(['EPERM', 'ENOTSUP', 'EXDEV', 'EOPNOTSUPP'])(
    'falls back to the plain replacement where links are unavailable (%s)',
    async (code) => {
      await writeFile(join(specDir, 'a.md'), 'old');
      const ops: DocumentFileOps = {
        ...nodeDocumentFileOps,
        link: () => Promise.reject(Object.assign(new Error(code), { code })),
      };
      const outcome = await applyPlannedPath(
        context({ ops, observe: foreignWrite(join(specDir, 'a.md'), 'foreign write') }),
        planned('a.md', 'old', 'new'),
        bytesOf('new'),
      );
      // The stated limit: without a link the foreign write in that window is not detected.
      expect(outcome).toEqual({ kind: 'applied' });
      expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('new');
      expect(await readdir(specDir)).toEqual(['a.md']);
    },
  );

  it('reports any other failure of the link', async () => {
    await writeFile(join(specDir, 'a.md'), 'old');
    const ops: DocumentFileOps = {
      ...nodeDocumentFileOps,
      link: () => Promise.reject(Object.assign(new Error('io'), { code: 'EIO' })),
    };
    await expect(
      applyPlannedPath(context({ ops }), planned('a.md', 'old', 'new'), bytesOf('new')),
    ).rejects.toMatchObject({ code: 'EIO' });
    expect(await readFile(join(specDir, 'a.md'), 'utf8')).toBe('old');
    expect(await readdir(specDir)).toEqual(['a.md']);
  });
});

describe('the mode of a replaced file', () => {
  it.skipIf(!onPosix)('keeps the executable bit of the file it replaces', async () => {
    await writeFile(join(specDir, 'run.sh'), 'old');
    await chmod(join(specDir, 'run.sh'), 0o755);
    await applyPlannedPath(context(), planned('run.sh', 'old', 'new'), bytesOf('new'));
    expect((await stat(join(specDir, 'run.sh'))).mode & 0o777).toBe(0o755);
    expect(await readFile(join(specDir, 'run.sh'), 'utf8')).toBe('new');
  });

  it.skipIf(!onPosix)('gives a new file no executable bit', async () => {
    await applyPlannedPath(context(), planned('fresh.md', null, 'x'), bytesOf('x'));
    expect((await stat(join(specDir, 'fresh.md'))).mode & 0o111).toBe(0);
  });
});

describe('the permission bits on a platform without them', () => {
  /** Runs `action` while `process.platform` reads `platform`; the production code asks it at call time. */
  async function asPlatform(platform: NodeJS.Platform, action: () => Promise<void>): Promise<void> {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...original, value: platform });
    try {
      await action();
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
  }

  it.skipIf(!onPosix)(
    'is not changed when the platform is Windows: there is no mode to set',
    async () => {
      const path = join(specDir, 'plain.md');
      await writeFile(path, 'x');
      await chmod(path, 0o640);
      await asPlatform('win32', () => nodeDocumentFileOps.chmod(path, 0o755));
      expect((await stat(path)).mode & 0o777).toBe(0o640);
    },
  );

  it.skipIf(!onPosix)('is set where the platform has them', async () => {
    const path = join(specDir, 'script.sh');
    await writeFile(path, 'x');
    await chmod(path, 0o640);
    await asPlatform('linux', () => nodeDocumentFileOps.chmod(path, 0o755));
    expect((await stat(path)).mode & 0o777).toBe(0o755);
  });
});
