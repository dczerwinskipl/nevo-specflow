import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const builder = join(repoRoot, 'tools', 'build-package.mjs');
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('repository package builder contract', () => {
  it('builds a platform-neutral package from the neutral profile', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: 'export const answer = 42;\n',
    });

    expect(runBuilder(fixture)).toMatchObject({ status: 0 });
  });

  it('rejects Node builtin imports from a neutral package', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: "import { readFile } from 'node:fs/promises';\nexport { readFile };\n",
    });

    const result = runBuilder(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("neutral package imports Node builtin 'node:fs/promises'");
  });

  it('builds a Node package only when the Node profile and engine contract agree', () => {
    const fixture = createFixture({
      profile: 'node',
      enginesNode: '>=24.20.0 <25',
      source: "import { basename } from 'node:path';\nexport { basename };\n",
    });

    expect(runBuilder(fixture)).toMatchObject({ status: 0 });
  });

  it('rejects a Node profile without engines.node', () => {
    const fixture = createFixture({
      profile: 'node',
      source: 'export const answer = 42;\n',
    });

    const result = runBuilder(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Node packages must declare engines.node');
  });

  it('rejects ambiguous neutral metadata that declares a Node engine', () => {
    const fixture = createFixture({
      profile: 'neutral',
      enginesNode: '>=24.20.0 <25',
      source: 'export const answer = 42;\n',
    });

    const result = runBuilder(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neutral packages must not declare engines.node');
  });

  it('uses TypeScript syntax rather than comments when enforcing neutral imports', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: "// import 'node:fs';\nexport const answer = 42;\n",
    });

    expect(runBuilder(fixture)).toMatchObject({ status: 0 });
  });

  it('rejects type-only Node builtin imports from a neutral package', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: "type Stat = import('node:fs').Stats;\nexport type { Stat };\n",
    });

    const result = runBuilder(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("neutral package imports Node builtin 'node:fs'");
  });

  it('does not treat co-located tests and stories as neutral production source', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: 'export const answer = 42;\n',
    });
    writeFileSync(
      join(fixture, 'src', 'index.test.ts'),
      "import { readFile } from 'node:fs/promises';\nvoid readFile;\n",
    );
    writeFileSync(
      join(fixture, 'src', 'index.stories.ts'),
      "import { basename } from 'node:path';\nvoid basename;\n",
    );
    writeFileSync(
      join(fixture, 'src', 'index.test-support.ts'),
      "import { randomUUID } from 'node:crypto';\nvoid randomUUID;\n",
    );

    expect(runBuilder(fixture)).toMatchObject({ status: 0 });
  });

  it('still validates production modules whose domain name contains .spec', () => {
    const fixture = createFixture({
      profile: 'neutral',
      source: 'export const answer = 42;\n',
    });
    writeFileSync(
      join(fixture, 'src', 'workflow.spec.ts'),
      "import { readFile } from 'node:fs/promises';\nexport { readFile };\n",
    );

    const result = runBuilder(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("neutral package imports Node builtin 'node:fs/promises'");
  });
});

interface FixtureOptions {
  readonly profile: 'neutral' | 'node';
  readonly source: string;
  readonly enginesNode?: string;
}

function createFixture(options: FixtureOptions): string {
  const fixture = mkdtempSync(join(repoRoot, '.tmp-package-builder-'));
  fixtures.push(fixture);
  mkdirSync(join(fixture, 'src'));

  const profilePath = join(
    repoRoot,
    options.profile === 'node' ? 'tsconfig.package-node.json' : 'tsconfig.package-neutral.json',
  );
  const relativeProfile = relative(fixture, profilePath).split(sep).join('/');
  const extendsProfile = relativeProfile.startsWith('.') ? relativeProfile : `./${relativeProfile}`;

  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify(
      {
        name: `@nevo/test-${options.profile}`,
        private: true,
        type: 'module',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
        },
        ...(options.enginesNode ? { engines: { node: options.enginesNode } } : {}),
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(fixture, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: extendsProfile,
        compilerOptions: {
          tsBuildInfoFile: './.tsbuild/test.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  );
  writeFileSync(join(fixture, 'src', 'index.ts'), options.source);

  return fixture;
}

function runBuilder(cwd: string): { readonly status: number | null; readonly stderr: string } {
  const result = spawnSync(process.execPath, [builder], {
    cwd,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stderr: result.stderr,
  };
}
