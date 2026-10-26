import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const fixture = vi.hoisted(() => ({ entry: '', privateRoot: '' }));
// Policy is independently tested with file/registry fixtures. This process integration
// substitutes only installation certification and the executable entrypoint; the real
// driver, process ownership, registry, coordinator, SQLite Worker and HTTP remain in use.
vi.mock('../../src/features/sessions/providers/claude/installation', () => ({
  claudeCertification: { version: '2.1.296' },
  inspectClaudeInstallation: () =>
    Promise.resolve({
      executable: process.execPath,
      version: '2.1.296',
      accountScope: 'fixture-account',
      secrets: [],
    }),
}));
vi.mock('../../src/features/sessions/providers/process', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/features/sessions/providers/process')>();
  return {
    ...original,
    launchOwnedProcess: (options: Parameters<typeof original.launchOwnedProcess>[0]) =>
      original.launchOwnedProcess({
        ...options,
        args: [fixture.entry, fixture.privateRoot, ...options.args],
      }),
  };
});

const program = `
import { createInterface } from 'node:readline';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const args = process.argv.slice(3),
  root = process.argv[2];
const at = args.indexOf('--resume'),
  fresh = args.indexOf('--session-id');
const id = at >= 0 ? args[at + 1] : fresh >= 0 ? args[fresh + 1] : undefined;
let count = 0,
  pending = false;
const send = (f) =>
  process.stdout.write(JSON.stringify({ ...f, uuid: randomUUID() }) + '\\n');
const finish = () => {
  send({
    type: 'assistant',
    session_id: id,
    message: {
      id: 'message_' + count,
      content: [{ type: 'text', text: 'Native turn ' + count }],
    },
  });
  send({
    type: 'result',
    session_id: id,
    subtype: 'success',
    is_error: false,
    result: 'Native turn ' + count,
    usage: { input_tokens: 2, output_tokens: 3 },
  });
};
createInterface({ input: process.stdin }).on('line', async (line) => {
  try {
    const f = JSON.parse(line);
    if (f.type === 'control_request') {
      send({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: f.request_id,
          response: {
            claude_code_version: '2.1.296',
            models: [{ value: 'default', displayName: 'Fixture model' }],
          },
        },
      });
      return;
    }
    if (f.type === 'user') {
      if (f.client_composed !== true) throw Error('literal input missing');
      if (at >= 0)
        count = Number(await readFile(join(root, id + '.txt'), 'utf8'));
      else count = 0;
      count++;
      await writeFile(join(root, id + '.txt'), String(count));
      send({
        type: 'system',
        subtype: 'init',
        session_id: id,
        cwd: process.cwd(),
        permissionMode: 'plan',
        claude_code_version: '2.1.296',
        tools: ['Read', 'Glob', 'Grep', 'AskUserQuestion'],
        mcp_servers: [],
        plugins: [],
      });
      if (f.message.content === 'quota') {
        send({
          type: 'assistant',
          session_id: id,
          error: 'rate_limit',
          message: {
            id: 'error_message',
            content: [{ type: 'text', text: 'private native diagnostic' }],
          },
        });
        send({
          type: 'result',
          session_id: id,
          subtype: 'success',
          is_error: true,
          terminal_reason: 'api_error',
          stop_reason: 'stop_sequence',
          api_error_status: 429,
          result: 'private native diagnostic',
        });
        return;
      }
      if (f.message.content === 'question') {
        const questions = [
          {
            question: 'Choose database',
            options: [{ label: 'SQLite' }, { label: 'Postgres' }],
            multiSelect: false,
          },
        ];
        send({
          type: 'assistant',
          session_id: id,
          message: {
            id: 'ask_message',
            content: [
              {
                type: 'tool_use',
                id: 'tool_1',
                name: 'AskUserQuestion',
                input: { questions },
              },
            ],
          },
        });
        send({
          type: 'control_request',
          request_id: 'question_1',
          request: {
            subtype: 'can_use_tool',
            tool_name: 'AskUserQuestion',
            tool_use_id: 'tool_1',
            input: { questions },
          },
        });
        pending = true;
        return;
      }
      finish();
      return;
    }
    if (f.type === 'control_response' && pending) {
      if (
        f.response.response.updatedInput.answers['Choose database'] !== 'SQLite'
      )
        throw Error('wrong answer');
      pending = false;
      send({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'SQLite' },
          ],
        },
      });
      finish();
    }
  } catch {
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
`;
let app: FastifyInstance | undefined;
let root = '';
async function open() {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
      sessions: {
        enabled: true,
        providers: { mock: { enabled: true }, claude: { enabled: true } },
      },
    },
    {
      sessions: {
        storage: {
          directory: join(root, 'store'),
          projectId: 'project',
          workspace: join(root, 'workspace'),
        },
      },
    },
  );
}
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'specflow-claude-http-'));
  await mkdir(join(root, 'workspace'));
  fixture.privateRoot = join(root, 'native');
  await mkdir(fixture.privateRoot);
  fixture.entry = join(root, 'native-provider.mjs');
  await writeFile(fixture.entry, program);
  await open();
  const created = await app!.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { requestId: randomUUID(), providerId: 'claude', mode: 'read-only' },
  });
  expect(created.statusCode).toBe(201);
  return created.json<{ sessionId: string }>().sessionId;
}
const snapshot = async (sessionId: string) =>
  (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
async function start(sessionId: string, message: string) {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/sessions/' + sessionId + '/turns',
    payload: { requestId: randomUUID(), message },
  });
  expect(response.statusCode).toBe(202);
  return response.json<{ turnId: string }>().turnId;
}
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (root) await rm(root, { recursive: true, force: true });
});
describe('Claude driver through the real process/store/HTTP boundary', () => {
  it('keeps a safe quota explanation readable after Runtime restart without exposing native error prose', async () => {
    const sessionId = await setup();
    await start(sessionId, 'quota');
    await vi.waitFor(
      async () => expect((await snapshot(sessionId)).entries.at(-1)?.text.text).toBe('failed'),
      { timeout: 5000 },
    );
    await app!.close();
    app = undefined;
    await open();
    const state = await snapshot(sessionId);
    expect(
      state.entries.some(
        (entry) =>
          entry.kind === 'commentary' &&
          entry.text.text === 'Claude quota or rate limit prevented the operation.',
      ),
    ).toBe(true);
    expect(JSON.stringify(state)).not.toContain('private native diagnostic');
  }, 20000);
  it('answers one live question, rejects over-selection before admission, reloads and resumes the exact native conversation', async () => {
    const sessionId = await setup();
    const providers = (await app!.inject('/api/session-providers')).json<{
      items: { providerId: string }[];
    }>();
    expect(providers.items.map((provider) => provider.providerId)).toEqual(['mock', 'claude']);
    await start(sessionId, 'question');
    await vi.waitFor(async () => expect((await snapshot(sessionId)).interaction).toBeDefined());
    const interaction = (await snapshot(sessionId)).interaction!;
    const url =
      '/api/sessions/' + sessionId + '/interactions/' + interaction.interactionId + '/respond';
    const invalid = await app!.inject({
      method: 'POST',
      url,
      payload: { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['0', '1'] } },
    });
    expect(invalid.statusCode).toBe(400);
    expect((await snapshot(sessionId)).interaction?.interactionId).toBe(interaction.interactionId);
    const response = await app!.inject({
      method: 'POST',
      url,
      payload: { requestId: randomUUID(), kind: 'question', answer: { optionIds: ['0'] } },
    });
    expect(response.statusCode).toBe(202);
    await vi.waitFor(
      async () => {
        const state = await snapshot(sessionId);
        expect({ active: state.activeTurn, last: state.entries.at(-1)?.text.text }).toEqual({
          active: undefined,
          last: 'completed',
        });
      },
      { timeout: 5000 },
    );
    const before = await snapshot(sessionId);
    expect(
      before.entries.some(
        (entry) => entry.kind === 'answer' && entry.text.text === 'Native turn 1',
      ),
    ).toBe(true);
    expect(before.session.capabilities.permissions).toBe(false);
    await app!.close();
    app = undefined;
    await open();
    await start(sessionId, 'continue');
    await vi.waitFor(async () =>
      expect(
        (await snapshot(sessionId)).entries.some(
          (entry) => entry.kind === 'answer' && entry.text.text === 'Native turn 2',
        ),
      ).toBe(true),
    );
    await vi.waitFor(async () => expect((await snapshot(sessionId)).activeTurn).toBeUndefined(), {
      timeout: 5000,
    });
    expect(await readdir(fixture.privateRoot)).toHaveLength(1);
    expect(await readdir(join(root, 'workspace'))).toEqual([]);
  }, 20000);
  it('cancels a live question and then allows a new Turn in the same native context', async () => {
    const sessionId = await setup();
    const turnId = await start(sessionId, 'question');
    await vi.waitFor(async () => expect((await snapshot(sessionId)).interaction).toBeDefined());
    const response = await app!.inject({
      method: 'POST',
      url: '/api/sessions/' + sessionId + '/turns/' + turnId + '/cancel',
      payload: { requestId: randomUUID() },
    });
    expect(response.statusCode).toBe(202);
    await vi.waitFor(
      async () => expect((await snapshot(sessionId)).entries.at(-1)?.text.text).toBe('cancelled'),
      { timeout: 5000 },
    );
    expect((await snapshot(sessionId)).interaction).toBeUndefined();
    await start(sessionId, 'continue');
    await vi.waitFor(async () =>
      expect(
        (await snapshot(sessionId)).entries.some(
          (entry) => entry.kind === 'answer' && entry.text.text === 'Native turn 2',
        ),
      ).toBe(true),
    );
    await vi.waitFor(async () => expect((await snapshot(sessionId)).activeTurn).toBeUndefined(), {
      timeout: 5000,
    });
  }, 20000);
});
