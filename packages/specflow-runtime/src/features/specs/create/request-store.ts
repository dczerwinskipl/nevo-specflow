import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CreateSpecRequestSchema } from '@nevo/specflow-contracts/specs';
import { isExecutorIdentity, type ExecutorIdentity } from '@nevo/specflow-engine';
import { OperationIdSchema } from '@nevo/specflow-contracts/operations';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * A Create the Runtime accepted, as it received it: written before the Engine reserves anything, so
 * a Runtime that dies before the Engine journal exists (or before the operation settled) still knows
 * the operation the owner started. The Runtime startup runs it again with the same id (the Engine
 * replays or resumes it); `failure` keeps a Create that ended without a result readable.
 */
const StoredCreateRequestSchema = Type.Object(
  {
    version: Type.Literal(1),
    operationId: OperationIdSchema,
    /** Who asked: the principal a resumed first-step start runs as. */
    principal: Type.String({ minLength: 1 }),
    /** The request body, with `operationId` set. */
    request: CreateSpecRequestSchema,
    createdAt: Type.String(),
    /**
     * The process that runs it (the accepting Runtime, or the one that resumed it): a later Runtime
     * reruns the Create only on positive evidence that this process is gone (ADR 0027).
     */
    executor: Type.Optional(Type.Unsafe<ExecutorIdentity>(Type.Object({}))),
    /**
     * A Runtime start already reran it once: it is never rerun again, the next start settles it with
     * a reason instead (a Specification never appears days after the owner started it).
     */
    resumed: Type.Optional(Type.Literal(true)),
    /**
     * How the last run ended without a result: `definite` is a refusal (nothing was or will be
     * created by this run), otherwise the outcome stays open and the next Runtime start tries again.
     */
    failure: Type.Optional(
      Type.Object(
        { code: Type.String({ minLength: 1 }), definite: Type.Boolean() },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type StoredCreateRequest = Static<typeof StoredCreateRequestSchema>;

export interface CreateRequestStore {
  read(operationId: string): Promise<StoredCreateRequest | undefined>;
  /** Creates or replaces the record of one operation (atomically). */
  write(record: StoredCreateRequest): Promise<void>;
  /** Every readable record; an unreadable one is skipped. */
  list(): Promise<readonly StoredCreateRequest[]>;
  remove(operationId: string): Promise<void>;
}

/** Under the Project Home's local state, next to the first-step intents: `state/runtime/create-requests`. */
export const CREATE_REQUEST_RELATIVE_DIR = join('runtime', 'create-requests');

const FILE_SUFFIX = '.json';

const isMissing = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/** One JSON file per operation id, written through a staged file and a rename (never half). */
export function createFileCreateRequestStore(directory: () => string): CreateRequestStore {
  const pathOf = (operationId: string) => {
    if (!Value.Check(OperationIdSchema, operationId)) {
      throw new Error('Invalid operation id for a Create request.');
    }

    return join(directory(), `${operationId}${FILE_SUFFIX}`);
  };

  async function readPath(path: string): Promise<StoredCreateRequest | undefined> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }

      throw error;
    }

    try {
      const value: unknown = JSON.parse(text);

      return Value.Check(StoredCreateRequestSchema, value) &&
        (value.executor === undefined || isExecutorIdentity(value.executor))
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    read: (operationId) => readPath(pathOf(operationId)),
    async write(record) {
      const path = pathOf(record.operationId);
      await mkdir(directory(), { recursive: true });
      const staged = join(directory(), `.${record.operationId}.${randomUUID()}.tmp`);
      await writeFile(staged, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
      try {
        await rename(staged, path);
      } catch (error) {
        await rm(staged, { force: true });

        throw error;
      }
    },
    async list() {
      let names: string[];
      try {
        names = await readdir(directory());
      } catch (error) {
        if (isMissing(error)) {
          return [];
        }

        throw error;
      }

      const records: StoredCreateRequest[] = [];
      for (const name of names) {
        if (!name.endsWith(FILE_SUFFIX) || name.startsWith('.')) {
          continue;
        }

        const record = await readPath(join(directory(), name)).catch(() => undefined);
        if (record) {
          records.push(record);
        }
      }

      return records;
    },
    remove: (operationId) => rm(pathOf(operationId), { force: true }),
  };
}

/** An in-memory store (tests). */
export function createMemoryCreateRequestStore(): CreateRequestStore & {
  readonly records: Map<string, StoredCreateRequest>;
} {
  const records = new Map<string, StoredCreateRequest>();

  return {
    records,
    read: (operationId) => Promise.resolve(structuredClone(records.get(operationId))),
    write(record) {
      records.set(record.operationId, structuredClone(record));

      return Promise.resolve();
    },
    list: () => Promise.resolve([...records.values()].map((record) => structuredClone(record))),
    remove(operationId) {
      records.delete(operationId);

      return Promise.resolve();
    },
  };
}
