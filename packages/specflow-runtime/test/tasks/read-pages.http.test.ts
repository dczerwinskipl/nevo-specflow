import { describe, expect, it, vi } from 'vitest';
import { createRuntimeApp } from '../../src/server/app';
import { createDemoEnvironment } from '../../src/demo';
import { createDemoDocumentReadSource } from '../../src/features/documents';
import { createDemoSpecsRepositories } from '../../src/features/specs';
import { passwordConfig } from '../auth/support/config';
import type { TaskHistoryPage, SpecificationTaskResponse } from '@nevo/specflow-contracts/tasks';
import type { TaskIdentity } from '../../src/features/tasks/reads/facts';
import {
  createFixtureTaskSources,
  fixtureHistory,
  fixtureResources,
} from '../support/task-sources';

/** The demo read source of the document routes over a fresh demo environment. */
const demoDocuments = (catalogue: Parameters<typeof createDemoDocumentReadSource>[1]) =>
  createDemoDocumentReadSource(createDemoEnvironment().documents, catalogue);
const config = () => {
  const config = passwordConfig();

  return { ...config, authentication: { ...config.authentication, mode: 'none' as const } };
};

const TASK = '/api/specs/admission/tasks/task-03';

describe('Task source paging and lease HTTP boundary', () => {
  it('keeps the frozen definition and execution unchanged across GET reads', async () => {
    const demo = createDemoSpecsRepositories(),
      sources = createFixtureTaskSources();
    const definition = (await sources.definitions.resolve('admission', 'task-03'))!;
    const execution = (await sources.execution.inspect(definition.identity, definition.version))!;
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') {
        for (const item of Object.values(value)) {
          freeze(item);
        }

        Object.freeze(value);
      }
    };

    const before = JSON.stringify({ definition, execution });
    freeze(definition);
    freeze(execution);
    const app = await createRuntimeApp(config(), {
      tasks: {
        ...sources,
        definitions: { resolve: () => Promise.resolve(definition) },
        execution: { inspect: () => Promise.resolve(execution) },
      },
      documents: { readSource: demoDocuments(demo.catalogue) },
    });
    try {
      const response = await app.inject(TASK);
      expect(response.statusCode).toBe(200);
      const history = response.json<SpecificationTaskResponse>().snapshot!.sections.history;
      if (history.state !== 'available') {
        throw Error('Expected history');
      }

      expect(
        (await app.inject(`${TASK}/history?token=${encodeURIComponent(history.data.token)}`))
          .statusCode,
      ).toBe(200);
      expect(
        (await app.inject('/api/specs/admission/documents/overview?revision=demo-document-1'))
          .statusCode,
      ).toBe(200);
      expect(JSON.stringify({ definition, execution })).toBe(before);
    } finally {
      await app.close();
    }
  });
  it('reads Task and document without Workspace and rejects a mismatched execution basis', async () => {
    const demo = createDemoSpecsRepositories(),
      sources = createFixtureTaskSources();
    const definition = (await sources.definitions.resolve('admission', 'task-03'))!;
    const execution = (await sources.execution.inspect(definition.identity, definition.version))!;
    execution.definitionVersion = 'other-definition';
    const app = await createRuntimeApp(config(), {
      tasks: { ...sources, execution: { inspect: () => Promise.resolve(execution) } },
      documents: { readSource: demoDocuments(demo.catalogue) },
    });
    try {
      const response = await app.inject(TASK);
      expect(response.statusCode).toBe(200);
      const sections = response.json<SpecificationTaskResponse>().snapshot!.sections;
      expect(sections.work.state).toBe('unavailable');
      expect(sections.history.state).toBe('unavailable');
      expect(
        (await app.inject('/api/specs/admission/documents/overview?revision=demo-document-1'))
          .statusCode,
      ).toBe(200);
      expect((await app.inject('/api/specs/admission/workspace')).statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
  it('reads one bounded history interval, preserves pass material and rejects changed basis', async () => {
    const sources = createFixtureTaskSources();
    let version = 'history-1';
    const base = fixtureHistory('admission', 'task-03')[0]!;
    const materials = fixtureResources('admission', 'task-03', 7);
    const entries = Array.from({ length: 7 }, (_, i) => ({
      ...base,
      id: 'attempt-' + i,
      key: { ...base.key, attempt: i + 1 },
      result: 'pass',
      feedback: null,
      resources: [materials[i]!],
    }));
    const read = vi.fn(
      (identity: TaskIdentity, _handle: string, continuation: string | null, limit: number) => {
        expect(limit).toBeLessThanOrEqual(50);
        const offset = continuation === null ? 0 : Number(continuation),
          end = Math.min(offset + limit, entries.length);

        return Promise.resolve({
          identity,
          version,
          items: entries.slice(offset, end),
          next: end < entries.length ? String(end) : null,
          coverage: 'complete' as const,
        });
      },
    );
    const app = await createRuntimeApp(config(), {
      tasks: {
        ...sources,
        history: {
          open: (identity) =>
            Promise.resolve({ identity, version, handle: 'source-handle', coverage: 'complete' }),
          read,
        },
      },
    });
    try {
      const detail = (await app.inject(TASK)).json<SpecificationTaskResponse>();
      expect(read).not.toHaveBeenCalled();
      const history = detail.snapshot!.sections.history;
      if (history.state !== 'available') {
        throw Error('Expected history');
      }

      const url = `${TASK}/history?token=` + encodeURIComponent(history.data.token);
      const first = (await app.inject(url + '&limit=2')).json<TaskHistoryPage>();
      expect(read).toHaveBeenCalledTimes(1);
      expect(first.items.map((item) => item.id)).toEqual(['attempt-0', 'attempt-1']);
      expect(first.items[0]!.resources).toHaveLength(1);
      expect(first.items[0]!.result).toBe('pass');
      expect(first.items[0]!.feedback).toBeNull();
      const continuation = url + '&cursor=' + encodeURIComponent(first.nextCursor!);
      const next = (await app.inject(continuation)).json<TaskHistoryPage>();
      expect(next.items.map((item) => item.id)).toEqual(['attempt-2', 'attempt-3']);
      expect((await app.inject(continuation + '&limit=3')).statusCode).toBe(409);
      expect((await app.inject(continuation)).json()).toEqual(next);
      version = 'history-2';
      expect((await app.inject(continuation)).statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
  it('retains continuation for an empty bounded candidate page and expires leases honestly', async () => {
    const sources = createFixtureTaskSources();
    let now = 0;
    const app = await createRuntimeApp(config(), {
      tasks: {
        ...sources,
        leaseOptions: { now: () => now, ttlMs: 10 },
        history: {
          open: (identity) =>
            Promise.resolve({ identity, handle: 'h', version: '1', coverage: 'partial' }),
          read: (identity, _handle, continuation) =>
            Promise.resolve({
              identity,
              version: '1',
              items: continuation === null ? [] : fixtureHistory('admission', 'task-03'),
              next: continuation === null ? 'continue' : null,
              coverage: 'partial',
            }),
        },
      },
    });
    try {
      const detail = (await app.inject(TASK)).json<SpecificationTaskResponse>();
      const section = detail.snapshot!.sections.history;
      if (section.state !== 'available') {
        throw Error('Expected history');
      }

      const url = `${TASK}/history?token=` + encodeURIComponent(section.data.token);
      const page = (await app.inject(url)).json<TaskHistoryPage>();
      expect(page.items).toEqual([]);
      expect(page.nextCursor).not.toBeNull();
      expect(page.coverage).toBe('partial');
      expect(
        (
          await app.inject(url + '&cursor=' + encodeURIComponent(page.nextCursor!))
        ).json<TaskHistoryPage>().items,
      ).toHaveLength(1);
      now = 10;
      expect((await app.inject(url)).statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});
