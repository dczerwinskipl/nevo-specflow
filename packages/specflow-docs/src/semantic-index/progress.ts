// The progress of a full index refresh (`semantic index`, a background catch-up, the Runtime
// refresh) as small files in the index directory, so another process can show it: `semantic status`
// and `GET /api/docs/status` combine the latest record with the vector store's writer lock.
//
// Every write goes to a new file name (`progress-<started>-<sequence>-<token>.json`, written to a
// temporary file and renamed to that name, which never exists yet), like the store's generation
// files: a reader holding the previous record open never makes a write fail on Windows. Readers take
// the highest name; the writer removes older records after each write. Progress is informational:
// a write that fails is skipped, a record that cannot be read is ignored.

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  inspectFileStoreWriter,
  type RefreshProgress,
  type WriterLockState,
} from '@nevo/ai-semantic-search';
import type { DocsIndexActivity } from '@nevo/specflow-contracts/docs';

import { vectorsDirectory } from './index-store';

/** Bump when the record shape changes; another version is ignored. */
export const PROGRESS_SCHEMA_VERSION = 1;

const PROGRESS_FILE = /^progress-\d{13}-\d{6}-[0-9a-f]+\.json$/;
/** A temporary file of a record write; group 1 is the record name it was written for. */
const PROGRESS_TEMPORARY = /^(progress-\d{13}-\d{6}-[0-9a-f]+\.json)\.[0-9a-f]+\.tmp$/;

/** One record: a refresh that is embedding (`running`) or has ended (`finished`). */
export type ProgressRecord = {
  readonly schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  readonly pid: number;
  /** ISO timestamps. */
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly embedded: number;
  readonly total: number;
} & (
  | { readonly state: 'running' }
  | {
      readonly state: 'finished';
      readonly outcome: 'completed' | 'failed';
      readonly generation?: number;
      readonly message?: string;
    }
);

/** How a recorded refresh ended. */
export type ProgressEnd =
  | { readonly outcome: 'completed'; readonly generation: number }
  | { readonly outcome: 'failed'; readonly message: string };

export interface ProgressRecorder {
  /**
   * Records the refresh's progress; the first call starts the record. Resolves once this record is
   * written (a refresh's progress callback does not wait for it).
   */
  update(progress: RefreshProgress): Promise<void>;
  /** Records the end of a refresh that recorded progress, after every pending write. */
  finish(end: ProgressEnd): Promise<void>;
}

export interface ProgressRecorderDependencies {
  readonly pid: number;
  readonly now: () => number;
}

/**
 * The writer side, for one refresh. `update` is called synchronously from the refresh's progress
 * callback; the writes run one after another in the background and `finish` waits for them. A
 * refresh that never reported progress (nothing to embed, or it failed before embedding) records
 * nothing, so the previous refresh stays the last one.
 */
export function createProgressRecorder(
  directory: string,
  dependencies: ProgressRecorderDependencies,
): ProgressRecorder {
  const token = randomBytes(6).toString('hex');
  let started: number | undefined;
  let sequence = 0;
  let latest: RefreshProgress = { embedded: 0, total: 0 };
  let writes = Promise.resolve();

  const write = (
    fields: Partial<ProgressRecord> & Pick<ProgressRecord, 'state'>,
  ): Promise<void> => {
    const startedAt = started!;
    const record = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      pid: dependencies.pid,
      startedAt: new Date(startedAt).toISOString(),
      updatedAt: new Date(dependencies.now()).toISOString(),
      embedded: latest.embedded,
      total: latest.total,
      ...fields,
    } as ProgressRecord;
    sequence += 1;
    const name = `progress-${String(startedAt).padStart(13, '0')}-${String(sequence).padStart(6, '0')}-${token}.json`;
    writes = writes.then(() => writeRecord(directory, name, record));

    return writes;
  };

  return {
    update(progress) {
      started ??= dependencies.now();
      latest = progress;

      return write({ state: 'running' });
    },
    async finish(end) {
      if (started !== undefined) {
        await write({ state: 'finished', ...end });
      }

      await writes;
    },
  };
}

async function writeRecord(directory: string, name: string, record: ProgressRecord): Promise<void> {
  const temporary = join(directory, `${name}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, JSON.stringify(record));
    await rename(temporary, join(directory, name));
  } catch {
    await unlink(temporary).catch(() => undefined);

    return;
  }

  // Older records, this refresh's and earlier ones, and temporary files left by an interrupted
  // write of an older record; one held open by a reader goes next time.
  const names = await readdir(directory).catch(() => [] as string[]);
  const older = (other: string) =>
    (PROGRESS_FILE.test(other) && other < name) ||
    (PROGRESS_TEMPORARY.exec(other)?.[1] ?? name) < name;
  await Promise.all(
    names.filter(older).map((other) => unlink(join(directory, other)).catch(() => undefined)),
  );
}

/** The latest valid record in `directory`, if any. */
export async function readLatestProgress(directory: string): Promise<ProgressRecord | undefined> {
  const names = (await readdir(directory).catch(() => [] as string[]))
    .filter((name) => PROGRESS_FILE.test(name))
    .sort()
    .reverse();
  for (const name of names) {
    const record = parseRecord(await readFile(join(directory, name), 'utf8').catch(() => ''));
    if (record !== undefined) {
      return record;
    }
  }

  return undefined;
}

/** Who writes the index in `directory` now (see `indexActivity`). */
export async function readIndexActivity(directory: string): Promise<DocsIndexActivity> {
  const [writer, record] = await Promise.all([
    inspectFileStoreWriter({ directory: vectorsDirectory(directory) }),
    readLatestProgress(directory),
  ]);

  return indexActivity(writer, record);
}

/**
 * Who writes the index now, from the writer lock and the latest record: the lock holder is
 * `updating`, with the record's progress when the record is its running refresh; otherwise the
 * last recorded refresh. A running record without its writer is `interrupted`.
 */
export function indexActivity(
  writer: WriterLockState,
  record: ProgressRecord | undefined,
): DocsIndexActivity {
  if (writer.status === 'held') {
    const own = record?.state === 'running' && record.pid === writer.pid ? record : undefined;

    return {
      state: 'updating',
      ...(writer.pid === undefined ? {} : { pid: writer.pid }),
      ...(own === undefined
        ? {}
        : {
            progress: {
              startedAt: own.startedAt,
              updatedAt: own.updatedAt,
              embedded: own.embedded,
              total: own.total,
            },
          }),
    };
  }

  if (record === undefined) {
    return { state: 'idle' };
  }

  const { startedAt, updatedAt: endedAt, embedded, total } = record;
  if (record.state === 'running') {
    return { state: 'idle', last: { outcome: 'interrupted', startedAt, endedAt, embedded, total } };
  }

  return {
    state: 'idle',
    last: {
      outcome: record.outcome,
      startedAt,
      endedAt,
      embedded,
      total,
      ...(record.generation === undefined ? {} : { generation: record.generation }),
      ...(record.message === undefined ? {} : { message: record.message }),
    },
  };
}

function parseRecord(text: string): ProgressRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const count = (field: unknown) => Number.isInteger(field) && (field as number) >= 0;
  const time = (field: unknown) => typeof field === 'string' && !Number.isNaN(Date.parse(field));
  const valid =
    record.schemaVersion === PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(record.pid) &&
    time(record.startedAt) &&
    time(record.updatedAt) &&
    count(record.embedded) &&
    count(record.total) &&
    (record.state === 'running' ||
      (record.state === 'finished' &&
        (record.outcome === 'completed' || record.outcome === 'failed') &&
        (record.generation === undefined || count(record.generation)) &&
        (record.message === undefined || typeof record.message === 'string')));

  return valid ? (value as ProgressRecord) : undefined;
}
