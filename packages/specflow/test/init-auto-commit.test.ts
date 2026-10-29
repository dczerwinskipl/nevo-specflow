import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeSetupUi } from '@nevo/specflow-runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { createProjectInitCommand } from '../src/init/cli';
import { chooseAutoCommit } from '../src/init/prompts';

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

/** Queued answers per prompt kind; an exhausted queue answers with the prompt's own default. */
function scripted(answers: { confirm?: boolean[]; select?: string[] }) {
  const confirm = [...(answers.confirm ?? [])];
  const select = [...(answers.select ?? [])];
  const asked: string[] = [];
  const ui = {
    confirm: (_message: string, initial?: boolean) =>
      Promise.resolve(confirm.shift() ?? initial ?? false),
    input: (_message: string, def?: string) => Promise.resolve(def ?? ''),
    select: (message: string, choices: readonly { value: string }[], initial?: string) => {
      asked.push(message);
      return Promise.resolve(select.shift() ?? initial ?? choices[0]!.value);
    },
    note: () => undefined,
  } as unknown as RuntimeSetupUi;
  return { ui, asked };
}

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

async function repository(): Promise<void> {
  root = await mkdtemp(join(tmpdir(), 'nevo-init-auto-'));
  git(root, 'init', '-b', 'trunk');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'init');
}

async function runInit(ui: RuntimeSetupUi): Promise<void> {
  const command = createProjectInitCommand({
    cwd: root,
    stdout: () => undefined,
    ui,
    initRuntime: () => Promise.resolve({ projectConfig: {}, localConfig: {}, summary: [] }),
  });
  await command.parseAsync(['--no-definitions'], { from: 'user' });
}

describe('init: automatic commit of documents', () => {
  it('defaults to no without an answer', async () => {
    const { ui } = scripted({});
    expect(await chooseAutoCommit(ui)).toBe(false);
    expect(await chooseAutoCommit(scripted({ select: ['yes'] }).ui)).toBe(true);
  });

  it('writes the opt-in to the workstation-local config only', async () => {
    await repository();
    const { ui, asked } = scripted({
      // git enabled; no custom protected pattern; write configuration.
      confirm: [true, false, true],
      select: ['trunk', 'feature/{slug}', 'yes'],
    });
    await runInit(ui);

    expect(asked).toContain('Commit documents automatically?');
    const local = await readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8');
    expect(local).toContain('auto:');
    expect(local).toContain('documents: true');
    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(project).not.toContain('auto');
  });

  it('writes nothing when the choice is declined or left to its default (non-interactive)', async () => {
    await repository();
    const { ui } = scripted({ confirm: [true, false, true], select: ['trunk', 'feature/{slug}'] });
    await runInit(ui);

    const local = await readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8');
    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(local).not.toContain('auto');
    expect(project).not.toContain('auto');
  });

  it('is not asked while Git is disabled', async () => {
    await repository();
    const { ui, asked } = scripted({ confirm: [false, true] });
    await runInit(ui);
    expect(asked).not.toContain('Commit documents automatically?');
  });
});
