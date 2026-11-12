import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DocsConfigError, DocsLinkRejectedError } from '../errors';
import { readCheckoutDocsSettings } from './settings';

const roots: string[] = [];
function checkout(config: string | undefined, docsYaml?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'specflow-docs-settings-'));
  roots.push(root);
  mkdirSync(join(root, '.nevo'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  if (config !== undefined) {
    writeFileSync(join(root, '.nevo', 'config.yaml'), config);
  }

  if (docsYaml !== undefined) {
    writeFileSync(join(root, 'docs', 'docs.yaml'), docsYaml);
  }

  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readCheckoutDocsSettings', () => {
  it('reads docs and docs.yaml, ignores other namespaces and fingerprints the settings', () => {
    // The `ai` block would be invalid for the embeddings parser; the reader never reads it.
    const root = checkout(
      'docs:\n  root: docs\nai:\n  embeddings: not-a-mapping\nelsewhere: 1\n',
      'nonAuthoritative: [ideas]\n',
    );
    const read = readCheckoutDocsSettings(root, { rejectLinks: true });
    expect(read).toMatchObject({
      status: 'configured',
      docs: { root: 'docs' },
      corpus: { root: 'docs', nonAuthoritative: ['ideas'] },
    });

    writeFileSync(join(root, 'docs', 'docs.yaml'), 'nonAuthoritative: [drafts]\n');
    const changed = readCheckoutDocsSettings(root, { rejectLinks: false });
    expect(changed.status === 'configured' && changed.fingerprint).not.toBe(
      read.status === 'configured' && read.fingerprint,
    );
  });

  it('tells an unconfigured checkout from an invalid one', () => {
    // The defaults apply like in the CLI: no `docs` or no `root` means `docs`.
    expect(readCheckoutDocsSettings(checkout('ai: {}\n'), { rejectLinks: true })).toMatchObject({
      status: 'configured',
      docs: { root: 'docs' },
    });
    expect(
      readCheckoutDocsSettings(checkout('docs:\n  search: {semantic: true}\n'), {
        rejectLinks: true,
      }),
    ).toMatchObject({ status: 'configured', docs: { root: 'docs' } });
    expect(
      readCheckoutDocsSettings(checkout('docs:\n  root: missing\n'), { rejectLinks: true }),
    ).toEqual({ status: 'not-configured' });
    expect(() =>
      readCheckoutDocsSettings(checkout('docs:\n  root: docs\n  bogus: 1\n'), {
        rejectLinks: true,
      }),
    ).toThrow(DocsConfigError);
    expect(() =>
      readCheckoutDocsSettings(checkout('docs:\n  root: docs\n', 'exclude: 3\n'), {
        rejectLinks: true,
      }),
    ).toThrow(DocsConfigError);
  });

  it('refuses a linked docs.yaml', (context) => {
    const root = checkout('docs:\n  root: docs/inner\n');
    const target = checkout(undefined, 'exclude: []\n');
    mkdirSync(join(root, 'docs', 'inner'));
    try {
      symlinkSync(join(target, 'docs', 'docs.yaml'), join(root, 'docs', 'inner', 'docs.yaml'));
    } catch {
      context.skip();
    }

    expect(() => readCheckoutDocsSettings(root, { rejectLinks: true })).toThrow(
      DocsLinkRejectedError,
    );
  });

  it('refuses a link in an outer segment of a nested root', () => {
    const target = checkout(undefined);
    const nested = checkout('docs:\n  root: docs/inner\n');
    rmSync(join(nested, 'docs'), { recursive: true });
    mkdirSync(join(target, 'docs', 'inner'), { recursive: true });
    symlinkSync(join(target, 'docs'), join(nested, 'docs'), 'junction');
    expect(() => readCheckoutDocsSettings(nested, { rejectLinks: true })).toThrow(
      DocsLinkRejectedError,
    );
  });

  it('refuses a linked docs root only when asked to', (context) => {
    const root = checkout('docs:\n  root: linked\n');
    const target = checkout(undefined);
    try {
      symlinkSync(join(target, 'docs'), join(root, 'linked'), 'junction');
    } catch {
      context.skip();
    }

    expect(() => readCheckoutDocsSettings(root, { rejectLinks: true })).toThrow(
      DocsLinkRejectedError,
    );
    expect(readCheckoutDocsSettings(root, { rejectLinks: false }).status).toBe('configured');
  });
});
