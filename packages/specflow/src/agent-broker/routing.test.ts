// The CLI inside an agent Turn (D11 point 2): a fake broker, never a real pipe.
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import type { DocumentsEngineApi } from '../documents/api';
import { ReportedFailure } from '../exit-code';
import { createProgram } from '../program';
import { agentRouteOf, type AgentBrokerTransport, type BrokerResponse } from './client';
import { BROKERED, READS, REFUSED, catchUpLaunchFor, commandPath, placementOf } from './routing';

const SPEC = '11111111-1111-4111-8111-111111111111';
const AGENT = { NEVO_AGENT_CAPABILITY: 'nvcap_x', NEVO_AGENT_BROKER: 'broker-endpoint' } as const;
const COMMIT = { state: 'pending', attempts: 0 } as const;

function harness(
  environment: Record<string, string>,
  respond: () => BrokerResponse = () => ({
    ok: true,
    value: {
      operation: 'documents.create',
      result: {
        operationId: '22222222-2222-4222-8222-222222222222',
        revision: 'tree-2',
        documents: [{ id: 'notes', path: 'notes.md', revision: 'rev-1', type: 'notes' }],
        removedDocumentIds: [],
        folders: [],
        commit: COMMIT,
      },
    },
  }),
) {
  const sent: { requestId: string; operation: unknown }[] = [];
  const engineCalls: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const broker: AgentBrokerTransport = {
    send: (requestId, operation) => {
      sent.push({ requestId, operation });

      return Promise.resolve(respond());
    },
  };
  const api = {
    openEngine: () => {
      engineCalls.push('openEngine');

      return Promise.resolve({});
    },
    write: () => {
      engineCalls.push('write');

      return Promise.resolve({
        operationId: 'op',
        specId: SPEC,
        action: 'create',
        documents: [],
        removedDocumentIds: [],
        folders: [],
        commit: { state: 'not-applicable' },
        stage: 'completed',
        replayed: false,
      });
    },
    flushAll: () => Promise.resolve({ checkouts: 0, remaining: 0, timedOut: false }),
  } as unknown as DocumentsEngineApi;
  const program = createProgram({
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    cwd: '.',
    environment,
    agentBroker: broker,
    documentsApi: api,
    readStdin: () => Promise.resolve('# Notes\n'),
  });

  return { program, sent, engineCalls, out, err };
}

const run = (h: ReturnType<typeof harness>, ...args: string[]) =>
  h.program.parseAsync(['node', 'nevo-specflow', ...args]);

describe('the CLI under an agent capability', () => {
  it('sends a Task draft and the finish proposal of the attempt to the broker', async () => {
    const h = harness(AGENT, () => ({
      ok: true,
      value: { operation: 'workflow.finish', result: { kind: 'recorded', transition: 'proposed' } },
    }));
    await run(
      h,
      'tasks',
      'create',
      SPEC,
      '--id',
      'api',
      '--title',
      'API',
      '--type',
      'implementation',
    );
    await run(
      h,
      'workflow',
      'finish',
      SPEC,
      '--step',
      'breakdown',
      '--attempt',
      '2',
      '--feedback',
      'Done.',
      '--changed',
      'src/a.ts',
    );

    expect(h.engineCalls).toEqual([]);
    expect(h.sent.map((entry) => entry.operation)).toEqual([
      { name: 'tasks.create', specId: SPEC, taskId: 'api', title: 'API', type: 'implementation' },
      {
        name: 'workflow.finish',
        specId: SPEC,
        step: 'breakdown',
        stepAttempt: 2,
        feedback: 'Done.',
        changes: { paths: ['src/a.ts'] },
      },
    ]);
    expect(h.out.at(-1)).toMatch(/Proposal recorded: proposed/);
  });

  it('sends documents add to the broker and never opens the Engine', async () => {
    const h = harness(AGENT);
    await run(
      h,
      'specs',
      'documents',
      'add',
      SPEC,
      '--path',
      'notes.md',
      '--type',
      'notes',
      '--stdin',
    );

    expect(h.engineCalls).toEqual([]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.operation).toEqual({
      name: 'documents.create',
      specId: SPEC,
      documents: [{ path: 'notes.md', content: '# Notes\n', type: 'notes' }],
    });
    expect(h.out.join('\n')).toContain('Document: notes notes.md revision rev-1');
  });

  it('uses the same request id for the same command, so a retry replays', async () => {
    const first = harness(AGENT);
    const second = harness(AGENT);
    const args = ['specs', 'documents', 'classify', SPEC, 'notes', '--type', 'notes'];
    await run(first, ...args, '--expected-revision', 'rev-1');
    await run(second, ...args, '--expected-revision', 'rev-1');

    expect(first.sent[0]!.requestId).toBe(second.sent[0]!.requestId);
    expect(first.sent[0]!.requestId).toMatch(/^cli-[0-9a-f]{40}$/);
  });

  it('shows a broker refusal with its code and reason, and exits 1', async () => {
    const h = harness(AGENT, () => ({
      ok: false,
      error: {
        code: 'AGENT_SCOPE_REFUSED',
        message: 'Specification x is not the home Specification of this Turn.',
      },
    }));
    const failure = await run(
      h,
      'specs',
      'documents',
      'save',
      SPEC,
      'notes',
      '--expected-revision',
      'rev-1',
      '--stdin',
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReportedFailure);
    expect(h.err.join('\n')).toContain(
      'AGENT_SCOPE_REFUSED: Specification x is not the home Specification of this Turn.',
    );
    expect(h.engineCalls).toEqual([]);
  });

  it('refuses a write the broker does not know, without opening the Engine or the broker', async () => {
    const h = harness(AGENT);
    const failure = await run(
      h,
      'specs',
      'documents',
      'delete',
      SPEC,
      '--document',
      'notes',
      '--expected-revision',
      'r',
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReportedFailure);
    expect(h.err.join('\n')).toContain('not available to an agent in this Turn');
    expect(h.engineCalls).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('refuses every write when the capability has no broker endpoint', async () => {
    const h = harness({ NEVO_AGENT_CAPABILITY: 'nvcap_x' });
    const failure = await run(
      h,
      'specs',
      'documents',
      'add',
      SPEC,
      '--path',
      'a.md',
      '--stdin',
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReportedFailure);
    expect(h.err.join('\n')).toContain('broker endpoint is missing');
    expect(h.engineCalls).toEqual([]);
  });

  it('keeps reads local', async () => {
    const h = harness(AGENT);
    await run(h, 'specs', 'documents', 'status', 'not-a-uuid').catch(() => undefined);

    expect(h.err.join('\n')).not.toContain('not available to an agent');
    expect(h.sent).toEqual([]);
  });
});

describe('the placement of every command', () => {
  const registered = (): string[] => {
    const program = createProgram({
      stdout: () => undefined,
      stderr: () => undefined,
      environment: {},
    });
    const paths: string[] = [];
    const walk = (command: Command): void => {
      if (command.commands.length === 0) {
        paths.push(commandPath(command));
      }

      command.commands.forEach(walk);
    };

    walk(program);

    return paths;
  };

  it('lists every registered command exactly once, and no command that does not exist', () => {
    const paths = registered();
    for (const path of paths) {
      const sets = [READS, BROKERED, REFUSED].filter((set) => set.has(path));
      expect(sets, path).toHaveLength(1);
    }

    for (const path of [...READS, ...BROKERED, ...REFUSED]) {
      expect(paths, path).toContain(path);
    }
  });

  it('refuses tasks status, a write of the Task status', async () => {
    expect(placementOf('tasks status')).toBe('refused');
    const h = harness(AGENT);
    const failure = await run(h, 'tasks', 'status', SPEC, 'task-1', 'approve').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ReportedFailure);
    expect(h.err.join('\n')).toContain('not available to an agent in this Turn');
  });
});

describe('agent route and catch-up', () => {
  it('treats a broker endpoint without a capability as broken, not as no Turn', () => {
    expect(agentRouteOf({ NEVO_AGENT_BROKER: 'endpoint' }).kind).toBe('broken');
    expect(agentRouteOf({ NEVO_AGENT_BROKER: 'endpoint', NEVO_AGENT_CAPABILITY: '' }).kind).toBe(
      'broken',
    );
    expect(agentRouteOf({ NEVO_AGENT_CAPABILITY: 'nvcap_x' }).kind).toBe('broken');
  });

  it('refuses a write when the endpoint has no capability', async () => {
    const h = harness({ NEVO_AGENT_BROKER: 'endpoint' });
    const failure = await run(
      h,
      'specs',
      'documents',
      'add',
      SPEC,
      '--path',
      'a.md',
      '--stdin',
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReportedFailure);
    expect(h.engineCalls).toEqual([]);
  });

  it('starts no background index catch-up inside an agent Turn', () => {
    const launch = { command: 'node', args: [] };
    expect(
      catchUpLaunchFor(agentRouteOf(AGENT, { send: () => Promise.reject(new Error('x')) }), launch),
    ).toBeUndefined();
    expect(catchUpLaunchFor({ kind: 'broken', message: 'm' }, launch)).toBeUndefined();
    expect(catchUpLaunchFor(agentRouteOf({}), launch)).toBe(launch);
  });
});

describe('the brokered save and classify', () => {
  it('sends save with the revision and the content', async () => {
    const h = harness(AGENT, () => ({
      ok: true,
      value: {
        operation: 'documents.save',
        result: {
          operationId: '33333333-3333-4333-8333-333333333333',
          document: { id: 'notes', path: 'notes.md', revision: 'rev-2' },
          commit: COMMIT,
        },
      },
    }));
    await run(
      h,
      'specs',
      'documents',
      'save',
      SPEC,
      'notes',
      '--expected-revision',
      'rev-1',
      '--stdin',
    );

    expect(h.engineCalls).toEqual([]);
    expect(h.sent[0]!.operation).toEqual({
      name: 'documents.save',
      specId: SPEC,
      documentId: 'notes',
      content: '# Notes\n',
      expectedRevision: 'rev-1',
    });
    expect(h.out.join('\n')).toContain('revision rev-2');
  });

  it('sends classify with the type and the revision', async () => {
    const h = harness(AGENT);
    await run(
      h,
      'specs',
      'documents',
      'classify',
      SPEC,
      'notes',
      '--type',
      'notes',
      '--expected-revision',
      'rev-1',
    );

    expect(h.engineCalls).toEqual([]);
    expect(h.sent[0]!.operation).toEqual({
      name: 'documents.classify',
      specId: SPEC,
      documentId: 'notes',
      type: 'notes',
      expectedRevision: 'rev-1',
    });
  });
});

describe('the CLI without a capability', () => {
  it('writes through the Engine as before and never touches the broker', async () => {
    const h = harness({});
    await run(h, 'specs', 'documents', 'add', SPEC, '--path', 'notes.md', '--stdin');

    expect(h.engineCalls).toEqual(['openEngine', 'write']);
    expect(h.sent).toEqual([]);
    expect(agentRouteOf({}).kind).toBe('none');
  });
});
