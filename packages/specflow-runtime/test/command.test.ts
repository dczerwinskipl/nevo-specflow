import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { createStartCommand } from '../src/cli/command.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('createStartCommand — Runtime CLI adapter', () => {
  it('returns a Commander command named "start"', () => {
    const cmd = createStartCommand({ stdout: () => undefined });
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('start');
    expect(cmd.description()).toMatch(/Runtime server/i);
  });

  it('starts the Runtime and reports its listening address', async () => {
    const out: string[] = [];
    let closed = false;
    const cmd = createStartCommand({
      stdout: (line) => out.push(line),
      start: () =>
        Promise.resolve({
          address: 'http://127.0.0.1:4318',
          close: () =>
            Promise.resolve().then(() => {
              closed = true;
            }),
        }),
    });
    cmd.exitOverride();
    await cmd.parseAsync(['node', 'start']);
    expect(out).toEqual(['Nevo SpecFlow Runtime listening at http://127.0.0.1:4318']);
    expect(closed).toBe(false);
  });

  it('owns graceful shutdown when an abort signal is supplied', async () => {
    const controller = new AbortController();
    let closed = false;
    const cmd = createStartCommand({
      stdout: () => undefined,
      signal: controller.signal,
      start: () =>
        Promise.resolve({
          address: 'http://127.0.0.1:4318',
          close: () =>
            Promise.resolve().then(() => {
              closed = true;
            }),
        }),
    });
    cmd.exitOverride();
    const running = cmd.parseAsync(['node', 'start']);
    controller.abort();
    await running;
    expect(closed).toBe(true);
  });

  it('keeps Commander out of the Runtime capability module', () => {
    const core = readFileSync(join(here, '..', 'src', 'index.ts'), 'utf8');
    expect(core).not.toMatch(/['"]commander['"]/);
    const adapter = readFileSync(join(here, '..', 'src', 'cli', 'command.ts'), 'utf8');
    expect(adapter).toMatch(/from 'commander'/);
  });
});
