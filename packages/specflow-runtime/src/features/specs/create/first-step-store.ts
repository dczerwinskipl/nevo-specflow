import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CreateFirstStepRequestSchema,
  CreateFirstStepResultSchema,
  type CreateFirstStepRequest,
  type CreateFirstStepResult,
} from '@nevo/specflow-contracts/specs';
import { OperationIdSchema } from '@nevo/specflow-contracts/operations';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * A Create's "then run the first step with this agent" intent, as the Runtime stores it: who asked
 * (the principal the start runs as), the agent they chose, the step it starts and, once the start is
 * settled, its result. Written before the Engine Create begins, so a Runtime restart finds it.
 */
const StoredFirstStepIntentSchema = Type.Object(
  {
    version: Type.Literal(1),
    operationId: OperationIdSchema,
    principal: Type.String({ minLength: 1 }),
    request: CreateFirstStepRequestSchema,
    step: Type.Object(
      { id: Type.String({ minLength: 1 }), title: Type.String() },
      { additionalProperties: false },
    ),
    createdAt: Type.String(),
    result: Type.Optional(CreateFirstStepResultSchema),
  },
  { additionalProperties: false },
);
export type StoredFirstStepIntent = Static<typeof StoredFirstStepIntentSchema>;

export interface FirstStepIntentStore {
  read(operationId: string): Promise<StoredFirstStepIntent | undefined>;
  /** Creates or replaces the record of one operation (atomically). */
  write(intent: StoredFirstStepIntent): Promise<void>;
  /** Every readable record; an unreadable one is skipped (it never blocks the others). */
  list(): Promise<readonly StoredFirstStepIntent[]>;
  remove(operationId: string): Promise<void>;
}

export type { CreateFirstStepRequest, CreateFirstStepResult };

/** Under the Project Home's local state, next to the Session store: `state/runtime/create-first-step`. */
export const FIRST_STEP_INTENT_RELATIVE_DIR = join('runtime', 'create-first-step');

const FILE_SUFFIX = '.json';

const isMissing = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/**
 * One JSON file per operation id (the id is a UUID, so it is a safe file name). Writes go through a
 * staged file and a rename, so a crash leaves the previous record or the new one, never half.
 */
export function createFileFirstStepIntentStore(directory: string): FirstStepIntentStore {
  const pathOf = (operationId: string) => {
    if (!Value.Check(OperationIdSchema, operationId)) {
      throw new Error('Invalid operation id for a first-step intent.');
    }

    return join(directory, `${operationId}${FILE_SUFFIX}`);
  };

  async function readPath(path: string): Promise<StoredFirstStepIntent | undefined> {
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

      return Value.Check(StoredFirstStepIntentSchema, value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    read: (operationId) => readPath(pathOf(operationId)),
    async write(intent) {
      await mkdir(directory, { recursive: true });
      const path = pathOf(intent.operationId);
      const staged = join(directory, `.${intent.operationId}.${randomUUID()}.tmp`);
      await writeFile(staged, `${JSON.stringify(intent, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
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
        names = await readdir(directory);
      } catch (error) {
        if (isMissing(error)) {
          return [];
        }

        throw error;
      }

      const intents: StoredFirstStepIntent[] = [];
      for (const name of names) {
        if (!name.endsWith(FILE_SUFFIX) || name.startsWith('.')) {
          continue;
        }

        const intent = await readPath(join(directory, name)).catch(() => undefined);
        if (intent) {
          intents.push(intent);
        }
      }

      return intents;
    },
    remove: (operationId) => rm(pathOf(operationId), { force: true }),
  };
}

/** An in-memory store (tests). */
export function createMemoryFirstStepIntentStore(): FirstStepIntentStore & {
  readonly records: Map<string, StoredFirstStepIntent>;
} {
  const records = new Map<string, StoredFirstStepIntent>();

  return {
    records,
    read: (operationId) => Promise.resolve(records.get(operationId)),
    write(intent) {
      records.set(intent.operationId, structuredClone(intent));

      return Promise.resolve();
    },
    list: () => Promise.resolve([...records.values()]),
    remove(operationId) {
      records.delete(operationId);

      return Promise.resolve();
    },
  };
}
