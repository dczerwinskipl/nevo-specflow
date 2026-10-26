import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { bootstrapProjectHome } from '@nevo/specflow-engine/testing';
import type { SessionSnapshot, WorkPage } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const observation = vi.hoisted(() => ({ frames: [] as unknown[] }));
// Observe protocol shape only. Delegate every byte and all process ownership to
// the real adapter; never retain account metadata, model prose or tool contents.
vi.mock('../../src/features/sessions/providers/process', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/features/sessions/providers/process')>();
  return {
    ...original,
    launchOwnedProcess: async (options: Parameters<typeof original.launchOwnedProcess>[0]) => {
      const owner = await original.launchOwnedProcess(options);
      return {
        ...owner,
        async *lines() {
          for await (const line of owner.lines()) {
            const frame = JSON.parse(line) as {
              type?: string;
              subtype?: string;
              permissionMode?: string;
              tools?: string[];
              request?: {
                subtype?: string;
                tool_name?: string;
                tool_use_id?: string;
                input?: Record<string, unknown>;
              };
            };
            if (
              observation.frames.length < 100 &&
              (frame.type === 'control_request' || frame.subtype === 'init')
            )
              observation.frames.push({
                type: frame.type,
                subtype: frame.subtype,
                permissionMode: frame.permissionMode,
                tools: frame.tools,
                request: frame.request
                  ? {
                      subtype: frame.request.subtype,
                      tool: frame.request.tool_name,
                      hasToolId: Boolean(frame.request.tool_use_id),
                      inputKeys: Object.keys(frame.request.input ?? {}),
                    }
                  : undefined,
              });
            yield line;
          }
        },
      };
    },
  };
});

/** Explicit opt-in only: uses the local Claude OAuth account and paid inference.
 * Every workspace write is confined by the test intent to a fresh owned repository.
 * Native isolation is still the installed provider's policy, not a test assertion. */
it
  .skipIf(process.env.SPECFLOW_LIVE_CLAUDE !== '1' || process.platform !== 'win32')
  .each(['acceptEdits', 'manual'])(
  'accepts a real Claude %s edit and semantic native resume through HTTP',
  async (providerModeId) => {
    observation.frames = [];
    const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-live-claude-')));
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
            providers: { mock: { enabled: false }, claude: { enabled: true } },
          },
        },
        { specs: { engine } },
      );
      const create = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          requestId: randomUUID(),
          providerId: 'claude',
          mode: 'workspace-write',
          providerModeId,
          modelId: 'haiku',
        },
      });
      expect(
        create.statusCode,
        create.body + ' ' + (await app.inject('/api/session-providers')).body,
      ).toBe(201);
      const { sessionId } = create.json<{ sessionId: string }>();
      let permissionsAnswered = 0;
      async function turn(message: string) {
        const response = await app!.inject({
          method: 'POST',
          url: '/api/sessions/' + sessionId + '/turns',
          payload: { requestId: randomUUID(), message },
        });
        expect(response.statusCode).toBe(202);
        let snapshot: SessionSnapshot | undefined;
        const responses = new Map<string, string>();
        const delivered = new Set<string>();
        await vi.waitFor(
          async () => {
            snapshot = (await app!.inject('/api/sessions/' + sessionId)).json<SessionSnapshot>();
            const interaction = snapshot.interaction;
            if (interaction && !delivered.has(interaction.interactionId)) {
              expect(interaction.kind).toBe('permission');
              if (interaction.kind !== 'permission') throw new Error('Unexpected live interaction');
              expect(interaction.actionSummary).toContain('Write file:');
              expect(interaction.actionSummary).toContain('agent-acceptance.txt');
              const requestId = responses.get(interaction.interactionId) ?? randomUUID();
              responses.set(interaction.interactionId, requestId);
              const result = await app!.inject({
                method: 'POST',
                url:
                  '/api/sessions/' +
                  sessionId +
                  '/interactions/' +
                  interaction.interactionId +
                  '/respond',
                payload: { requestId, kind: 'permission', decision: 'allow' },
              });
              expect(result.statusCode, result.body).toBe(202);
              delivered.add(interaction.interactionId);
              permissionsAnswered++;
            }
            expect(
              snapshot.activeTurn === undefined || snapshot.activeTurn.state === 'unknown',
            ).toBe(true);
          },
          { timeout: 90000, interval: 200 },
        );
        expect(
          snapshot!.activeTurn,
          JSON.stringify({ active: snapshot!.activeTurn, protocol: observation.frames }),
        ).toBeUndefined();
        expect(
          snapshot!.entries.at(-1)?.text.text,
          snapshot!.entries
            .slice(-4)
            .map((entry) => entry.text.text)
            .join('\n'),
        ).toBe('completed');
        return snapshot!;
      }
      const token = 'acceptance-' + randomUUID();
      await turn(
        'Use the Write tool to create only agent-acceptance.txt in the current workspace with exactly ' +
          token +
          '. Do not run shell commands, use background work, or modify any other file. Then reply briefly.',
      );
      expect((await readFile(join(root, 'agent-acceptance.txt'), 'utf8')).trim()).toBe(token);
      if (providerModeId === 'manual') expect(permissionsAnswered).toBeGreaterThan(0);
      await rm(join(root, 'agent-acceptance.txt'));
      const resumed = await turn(
        'Without reading any file or using tools, repeat the exact acceptance token from our previous turn.',
      );
      const resumedTurnId = resumed.entries.at(-1)!.turnId;
      expect(
        resumed.entries
          .filter((entry) => entry.kind === 'answer' && entry.turnId === resumedTurnId)
          .at(-1)?.text.text,
      ).toContain(token);
      const work = (
        await app.inject('/api/sessions/' + sessionId + '/turns/' + resumedTurnId + '/work')
      ).json<WorkPage>();
      expect(work.items.filter((item) => item.kind === 'tool')).toEqual([]);
      expect(work.history.hasOlder).toBe(false);
    } finally {
      await app?.close();
      // Exact owned mkdtemp root, never a user-supplied or repository checkout path.
      await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    }
  },
  120000,
);
