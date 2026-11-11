// A throwaway project with a handful of documents; tests never read this repository's `docs/`.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { DocsProject } from '@nevo/specflow-docs/cli';

export const fm = (o: Record<string, string>, body = '# body\n'): string =>
  `---\n${Object.entries(o)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n${body}`;

const FIXTURE_FILES: Record<string, string> = {
  'docs/docs.yaml': 'exclude: [templates/]\n',
  'docs/README.md': fm({ id: 'docs.readme', type: 'hub', title: 'Docs', status: 'current' }),
  'docs/architecture/decisions/0001-first.md': fm(
    {
      id: 'adr.0001-first',
      type: 'adr',
      title: 'First',
      status: 'current',
      date: '2026-09-06',
      summary: 'A real decision about widgets.',
    },
    '# 0001 — First\n\n## Decision\n\nWidgets are rendered on the server.\n',
  ),
  'docs/templates/adr-template.md': '# ADR template without frontmatter\n',
};

export function createFixtureProject(): DocsProject {
  const root = mkdtempSync(join(tmpdir(), 'nevo-repo-docs-'));
  for (const [path, content] of Object.entries(FIXTURE_FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return {
    root,
    projectConfigPath: join(root, '.nevo', 'config.yaml'),
    localConfigPath: join(root, '.nevo', 'local', 'config.yaml'),
  };
}
