import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DocsCorpusInvalidError,
  loadDocsSettings,
  openFileSystemCorpus,
  type DocsCorpus,
} from '@nevo/specflow-docs';
import type { DocsProject } from '@nevo/specflow-docs/cli';
import { afterEach, describe, expect, it } from 'vitest';

import { createAdr } from '../../src/app/create-adr.js';
import { REPOSITORY_CORPUS_RULES } from '../../src/cli/program.js';
import { createAdrFiles } from '../../src/infra/adr-files.js';
import { createFixtureProject } from '../support/fixture.js';

const projects: DocsProject[] = [];
afterEach(() =>
  projects.splice(0).forEach((p) => rmSync(p.root, { recursive: true, force: true })),
);

function setup(): { project: DocsProject; corpus: DocsCorpus } {
  const project = createFixtureProject();
  projects.push(project);
  const { docs } = loadDocsSettings(project);

  return { project, corpus: openFileSystemCorpus(project.root, docs, REPOSITORY_CORPUS_RULES) };
}

const NEW_ADR = 'docs/architecture/decisions/0002-use-x-for-y.md';

describe('createAdr', () => {
  it('writes the next draft ADR and regenerates the index', () => {
    const { project, corpus } = setup();
    const result = createAdr(corpus, createAdrFiles(project.root, 'docs'), {
      title: 'Use X for Y',
      date: '2026-09-06',
    });
    expect(result).toMatchObject({ written: true, indexRegenerated: true });
    expect(readFileSync(join(project.root, NEW_ADR), 'utf8')).toContain('status: draft');
    expect(readFileSync(join(project.root, 'docs/index.generated.md'), 'utf8')).toContain(
      'adr.0002-use-x-for-y',
    );
  });

  it('dry-run writes nothing', () => {
    const { project, corpus } = setup();
    const result = createAdr(corpus, createAdrFiles(project.root, 'docs'), {
      title: 'Use X for Y',
      date: '2026-09-06',
      dryRun: true,
    });
    expect(result.written).toBe(false);
    expect(existsSync(join(project.root, NEW_ADR))).toBe(false);
  });

  it('refuses to add on top of an already-invalid corpus', () => {
    const { project, corpus } = setup();
    writeFileSync(join(project.root, 'docs/broken.md'), '# no frontmatter\n');
    expect(() =>
      createAdr(corpus, createAdrFiles(project.root, 'docs'), { title: 'X', date: '2026-09-06' }),
    ).toThrow(DocsCorpusInvalidError);
    expect(existsSync(join(project.root, 'docs/architecture/decisions/0002-x.md'))).toBe(false);
  });

  it('rolls the new file back if the post-write corpus check fails', () => {
    const { project, corpus } = setup();
    const files = createAdrFiles(project.root, 'docs');
    // A document that turns invalid between the plan and the re-validation.
    const failing = {
      ...files,
      write(file: string, content: string) {
        files.write(file, content);
        writeFileSync(join(project.root, 'docs/ghost.md'), '# no frontmatter\n');
      },
    };

    expect(() => createAdr(corpus, failing, { title: 'Later', date: '2026-09-06' })).toThrow(
      DocsCorpusInvalidError,
    );
    expect(existsSync(join(project.root, 'docs/architecture/decisions/0002-later.md'))).toBe(false);
  });
});
