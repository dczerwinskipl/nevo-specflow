import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { bootstrapProjectHome } from '@nevo/specflow-engine/testing';
import type {
  ProviderDescriptor,
  SessionSnapshot,
  WorkPage,
} from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const observation = vi.hoisted(() => ({ frames: [] as unknown[] }));
vi.mock('../../src/features/sessions/providers/process', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/features/sessions/providers/process')>();
  return {
    ...original,
    async launchOwnedProcess(options: Parameters<typeof original.launchOwnedProcess>[0]) {
      const owner = await original.launchOwnedProcess(options);
      return {
        ...owner,
        async *lines() {
          for await (const line of owner.lines()) {
            try {
              const frame = JSON.parse(line) as {
                method?: string;
                params?: { item?: { type?: string } };
              };
              if (frame.method && observation.frames.length < 120)
                observation.frames.push({
                  method: frame.method,
                  itemType: frame.params?.item?.type,
                });
            } catch {
              /* Startup config is pretty-printed JSON rather than an RPC frame. */
            }
            yield line;
          }
        },
      };
    },
  };
});

/** Explicit opt-in: real local ChatGPT CLI login and paid model inference.
 * The native execution policy and Engine claim remain the production path. */
it.skipIf(process.env.SPECFLOW_LIVE_CODEX !== '1' || process.platform !== 'win32')(
  'writes through real Codex Agent and resumes the same native conversation through HTTP',
  async () => {
    const parent = join(homedir(), '.nevo', 'runtime', 'provider-acceptance');
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const root = await realpath(await mkdtemp(join(parent, 'codex-http-')));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' });
    let app: Awaited<ReturnType<typeof createRuntimeApp>> | undefined;
    try {
      git('init', '-q');
      await mkdir(join(root, '.nevo'));
      await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
      await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
      git('add', '.gitignore', '.nevo/config.yaml');
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'initial',
      );
      const engine = await bootstrapProjectHome(root);
      const config = passwordConfig();
      app = await createRuntimeApp(
        {
          ...config,
          authentication: { ...config.authentication, mode: 'none' },
          sessions: {
            enabled: true,
            providers: { mock: { enabled: false }, codex: { enabled: true } },
          },
        },
        { specs: { engine } },
      );
      const providerResponse = await app.inject('/api/session-providers');
      expect(providerResponse.statusCode, providerResponse.body).toBe(200);
      const providers = providerResponse.json<{ items: ProviderDescriptor[] }>();
      const provider = providers.items.find((item) => item.providerId === 'codex');
      expect(provider?.readiness, JSON.stringify(provider)).toBe('ready');
      const model = provider!.models.find((item) => item.efforts.includes('low'));
      expect(model).toBeDefined();
      const create = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          requestId: randomUUID(),
          providerId: 'codex',
          mode: 'workspace-write',
          providerModeId: 'default',
          modelId: model!.modelId,
          effort: 'low',
        },
      });
      expect(create.statusCode, create.body).toBe(201);
      const { sessionId } = create.json<{ sessionId: string }>();
      async function turn(message: string) {
        const start = await app!.inject({
          method: 'POST',
          url: '/api/sessions/' + sessionId + '/turns',
          payload: { requestId: randomUUID(), message },
        });
        expect(start.statusCode, start.body).toBe(202);
        let snapshot: SessionSnapshot | undefined;
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
          snapshot = (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
          if (snapshot.interaction) {
            expect(snapshot.interaction.kind).toBe('permission');
            if (snapshot.interaction.kind !== 'permission')
              throw new Error('Unexpected native question');
            expect(snapshot.interaction.actionSummary).toContain('agent-acceptance.txt');
            const answer = await app!.inject({
              method: 'POST',
              url:
                '/api/sessions/' +
                sessionId +
                '/interactions/' +
                snapshot.interaction.interactionId +
                '/respond',
              payload: { requestId: randomUUID(), kind: 'permission', decision: 'allow' },
            });
            expect(answer.statusCode, answer.body).toBe(202);
          }
          if (!snapshot.activeTurn || snapshot.activeTurn.state === 'unknown') break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        expect(snapshot?.activeTurn, JSON.stringify(observation.frames)).toBeUndefined();
        expect(
          snapshot?.entries.at(-1)?.text.text,
          JSON.stringify({ entries: snapshot?.entries.slice(-4), shapes: observation.frames }),
        ).toBe('completed');
        return snapshot!;
      }
      const token = 'acceptance-' + randomUUID();
      const written = await turn(
        'Use apply_patch to create only agent-acceptance.txt in the current workspace containing exactly ' +
          token +
          '. Do not run shell commands, access the network, use background work, or modify any other file. Then reply briefly.',
      );
      const contents = await readFile(join(root, 'agent-acceptance.txt'), 'utf8').catch(() => {
        throw new Error(
          'No requested edit. Canonical answers: ' +
            JSON.stringify(
              written.entries
                .filter((entry) => entry.kind === 'answer' || entry.kind === 'commentary')
                .map((entry) => entry.text.text),
            ) +
            ' Shapes: ' +
            JSON.stringify(observation.frames),
        );
      });
      expect(contents.trim()).toBe(token);
      await rm(join(root, 'agent-acceptance.txt'));
      const resumed = await turn(
        'Without using any tools or reading files, repeat the exact acceptance token from our previous turn.',
      );
      const turnId = resumed.entries.at(-1)!.turnId;
      expect(
        resumed.entries.filter((entry) => entry.kind === 'answer' && entry.turnId === turnId).at(-1)
          ?.text.text,
      ).toContain(token);
      const work = (
        await app.inject('/api/sessions/' + sessionId + '/turns/' + turnId + '/work')
      ).json<WorkPage>();
      expect(work.items.some((item) => item.kind === 'tool')).toBe(false);
      expect(work.history.hasOlder).toBe(false);
    } finally {
      await app?.close();
      // root is the exact mkdtemp result under the owned acceptance parent.
      await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    }
  },
  300000,
);
