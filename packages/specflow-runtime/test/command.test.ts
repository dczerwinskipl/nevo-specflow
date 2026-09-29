import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { createStartCommand } from '../src/cli/command.js';
import { RUNTIME_BOOTSTRAP_MARKER } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('createStartCommand — Runtime CLI adapter', () => {
  it('returns a Commander command named "start"', () => {
    const cmd = createStartCommand({ stdout: () => undefined });
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('start');
    expect(cmd.description()).toMatch(/SpecFlow/i);
  });

  it('runs the Runtime capability and writes the marker', async () => {
    const out: string[] = [];
    const cmd = createStartCommand({ stdout: (line) => out.push(line) });
    cmd.exitOverride();
    await cmd.parseAsync(['node', 'start']);
    expect(out).toEqual([RUNTIME_BOOTSTRAP_MARKER]);
  });

  it('keeps Commander out of the Runtime capability module', () => {
    const core = readFileSync(join(here, '..', 'src', 'index.ts'), 'utf8');
    expect(core).not.toMatch(/['"]commander['"]/);
    const adapter = readFileSync(join(here, '..', 'src', 'cli', 'command.ts'), 'utf8');
    expect(adapter).toMatch(/from 'commander'/);
  });
});
