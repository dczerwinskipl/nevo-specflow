import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedProjectHome } from '../../../project/home/home';
import { CREATE_JOURNAL_RELATIVE_DIR } from './store';
import {
  createPayloadDirectory,
  payloadOperationIdOf,
  readCreatePayload,
  removeCreatePayload,
  writeCreatePayload,
} from './payload';
import { sha256Hex } from '../../../hash';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

async function fixture(): Promise<ResolvedProjectHome> {
  const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-payload-')));
  roots.push(stateRoot);
  await mkdir(join(stateRoot, CREATE_JOURNAL_RELATIVE_DIR), { recursive: true });

  return { project: { stateRoot } } as unknown as ResolvedProjectHome;
}

const file = (content: string) => ({
  sha256: sha256Hex(content),
  bytes: Buffer.byteLength(content, 'utf8'),
  content,
});

describe('Create payload store', () => {
  it('stores each file by its hash and reads it back verified', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const first = file('first €');
    const second = file('second');
    await writeCreatePayload(context, operationId, [first, second, first]);
    expect((await readdir(createPayloadDirectory(context, operationId))).sort()).toEqual(
      [first.sha256, second.sha256].sort(),
    );
    const evidence = (item: ReturnType<typeof file>) => ({
      relativePath: 'x',
      sha256: item.sha256,
      bytes: item.bytes,
    });
    expect(await readCreatePayload(context, operationId, evidence(first))).toBe(first.content);
    expect(await readCreatePayload(context, operationId, evidence(second))).toBe('second');
  });

  it('never names the directory like a journal, so journal readers ignore it', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const directory = createPayloadDirectory(context, operationId);
    expect(directory.endsWith('.json')).toBe(false);
    expect(payloadOperationIdOf(`${operationId}.payload`)).toBe(operationId);
    expect(payloadOperationIdOf(`${operationId}.json`)).toBeUndefined();
    expect(payloadOperationIdOf('not-an-id.payload')).toBeUndefined();
  });

  it('refuses content that does not match its declared hash before writing', async () => {
    const context = await fixture();
    await expect(
      writeCreatePayload(context, randomUUID(), [{ sha256: 'a'.repeat(64), content: 'x' }]),
    ).rejects.toThrow();
  });

  it('replaces the leftovers of an earlier crash of the same operation id', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const stale = file('stale');
    await writeCreatePayload(context, operationId, [stale]);
    const fresh = file('fresh');
    await writeCreatePayload(context, operationId, [fresh]);
    expect(await readdir(createPayloadDirectory(context, operationId))).toEqual([fresh.sha256]);
  });

  it('reports a missing, truncated or modified payload as CREATE_RECOVERY_REQUIRED', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const item = file('original content');
    const evidence = { relativePath: 'x', sha256: item.sha256, bytes: item.bytes };
    await expect(readCreatePayload(context, operationId, evidence)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
    await writeCreatePayload(context, operationId, [item]);
    const path = join(createPayloadDirectory(context, operationId), item.sha256);
    // Same size, other bytes: only the hash can tell.
    await writeFile(path, 'tampered content!');
    await expect(readCreatePayload(context, operationId, evidence)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
    await writeFile(path, 'short');
    await expect(readCreatePayload(context, operationId, evidence)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
  });

  it('removes a payload directory and tolerates an absent one', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    await writeCreatePayload(context, operationId, [file('x')]);
    await removeCreatePayload(context, operationId);
    await removeCreatePayload(context, operationId);
    expect(await readdir(join(context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR))).toEqual([]);
  });
});
