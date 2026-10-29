import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installProjectDefinitionFiles, type SpecFlowEngine } from '@nevo/specflow-engine';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFINITIONS_MISSING_HINT,
  definitionsMissingHint,
  printDefinitionsMissingHint,
} from '../src/definitions/startup-hint';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function home(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await mkdtemp(join(tmpdir(), 'specflow-hint-'));
  roots.push(root);
  return { root, engine: { context: { project: { homeRoot: root } } } as SpecFlowEngine };
}

describe('definitions missing hint at startup', () => {
  it('names the install command for a project without definitions', async () => {
    const { engine } = await home();
    expect(await definitionsMissingHint(engine)).toBe(DEFINITIONS_MISSING_HINT);
    expect(DEFINITIONS_MISSING_HINT).toContain('nevo-specflow definitions install');
  });

  it('also speaks when every definition file is invalid', async () => {
    const { root, engine } = await home();
    await mkdir(join(root, '.nevo', 'definitions', 'document-type'), { recursive: true });
    await writeFile(join(root, '.nevo', 'definitions', 'document-type', 'overview.yaml'), 'x: [');
    expect(await definitionsMissingHint(engine)).toBe(DEFINITIONS_MISSING_HINT);
  });

  it('is silent once the definitions are installed', async () => {
    const { root, engine } = await home();
    await installProjectDefinitionFiles(root);
    expect(await definitionsMissingHint(engine)).toBeUndefined();
  });

  it('never fails the start when the project cannot be opened', async () => {
    const { root } = await home();
    const lines: string[] = [];
    await printDefinitionsMissingHint(root, (line) => lines.push(line));
    expect(lines).toEqual([]);
  });
});
