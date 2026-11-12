import { describe, expect, it } from 'vitest';
import { inertImage } from './imagePolicy';
import { createDocsLinkIndex, resolveDocsLink } from './linkPolicy';

const doc = (documentId: string, path: string, title = documentId) => ({
  documentId,
  title,
  type: 'guide',
  status: 'current',
  path,
  summary: '',
  nonAuthoritative: false,
});

const index = createDocsLinkIndex({
  docsRoot: 'docs',
  documents: [
    doc('home', 'README.md', 'Home'),
    doc('auth', 'guides/auth.md', 'Authentication'),
    doc('login', 'guides/login.md', 'Login'),
  ],
  inactive: [
    { documentId: 'old', path: 'guides/old.md', status: 'superseded', supersededBy: 'auth' },
    { documentId: 'gone', path: 'guides/gone.md', status: 'deprecated' },
  ],
  skipped: [{ path: 'guides/broken.md', error: 'guides/broken.md: title is missing' }],
});

/** Links of `guides/auth.md`. */
const resolve = (href: string | undefined) =>
  resolveDocsLink(href, { fromPath: 'guides/auth.md', fromDocumentId: 'auth', index });

describe('documentation link policy', () => {
  it('opens a current document of this workspace, with its section', () => {
    expect(resolve('login.md')).toEqual({ kind: 'document', documentId: 'login' });
    expect(resolve('./login.md#sign-in')).toEqual({
      kind: 'document',
      documentId: 'login',
      sectionId: 'sign-in',
    });
    expect(resolve('../README.md')).toEqual({ kind: 'document', documentId: 'home' });
    expect(resolve('login%2Emd')).toEqual({ kind: 'document', documentId: 'login' });
  });

  it('scrolls to a section of the same document', () => {
    expect(resolve('#tokens')).toEqual({ kind: 'section', sectionId: 'tokens' });
    expect(resolve('auth.md#tokens')).toEqual({ kind: 'section', sectionId: 'tokens' });
    expect(resolve('auth.md')).toEqual({ kind: 'section', sectionId: '_top' });
  });

  it('opens only http, https and mailto externally', () => {
    expect(resolve('https://example.com/a')).toEqual({
      kind: 'external',
      href: 'https://example.com/a',
    });
    expect(resolve('HTTP://example.com')).toMatchObject({ kind: 'external' });
    expect(resolve('mailto:team@example.com')).toMatchObject({ kind: 'external' });
    expect(resolve('https:example.com')).toMatchObject({ inert: { reason: 'unsafe-scheme' } });
  });

  it('keeps a superseded or deprecated document inert, with its successor when it is current', () => {
    expect(resolve('old.md')).toEqual({
      kind: 'inert',
      inert: {
        reason: 'superseded',
        target: 'guides/old.md',
        status: 'superseded',
        successor: { documentId: 'auth', title: 'Authentication' },
      },
    });
    expect(resolve('gone.md')).toEqual({
      kind: 'inert',
      inert: { reason: 'superseded', target: 'guides/gone.md', status: 'deprecated' },
    });
  });

  it('keeps files and folders outside docs.root inert', () => {
    expect(resolve('../../packages/ui/README.md')).toEqual({
      kind: 'inert',
      inert: { reason: 'outside-docs', target: 'packages/ui/README.md' },
    });
    expect(resolve('../../src/')).toEqual({
      kind: 'inert',
      inert: { reason: 'outside-docs', target: 'src/' },
    });
    expect(resolve('../../../up.md')).toMatchObject({ inert: { target: '../up.md' } });
    expect(resolve('/src/main.ts')).toEqual({
      kind: 'inert',
      inert: { reason: 'outside-docs', target: 'src/main.ts' },
    });
    // A repository-root path below docs.root is an ordinary document link.
    expect(resolve('/docs/guides/login.md')).toEqual({ kind: 'document', documentId: 'login' });
  });

  it('keeps a folder inside docs.root and a non-Markdown file inert', () => {
    expect(resolve('../guides')).toEqual({
      kind: 'inert',
      inert: { reason: 'folder', target: 'guides/' },
    });
    expect(resolve('./')).toEqual({
      kind: 'inert',
      inert: { reason: 'folder', target: 'guides/' },
    });
    expect(resolve('diagram.svg')).toEqual({
      kind: 'inert',
      inert: { reason: 'not-markdown', target: 'guides/diagram.svg' },
    });
  });

  it('keeps a skipped document inert with its error', () => {
    expect(resolve('broken.md')).toEqual({
      kind: 'inert',
      inert: {
        reason: 'skipped',
        target: 'guides/broken.md',
        error: 'guides/broken.md: title is missing',
      },
    });
  });

  it('keeps a missing document and an unsafe scheme inert', () => {
    expect(resolve('nowhere.md#x')).toEqual({
      kind: 'inert',
      inert: { reason: 'missing', target: 'guides/nowhere.md' },
    });
    expect(resolve('file:///etc/passwd')).toEqual({
      kind: 'inert',
      inert: { reason: 'unsafe-scheme', target: 'file:///etc/passwd', scheme: 'file' },
    });
    expect(resolve('//evil.example/x')).toMatchObject({ inert: { reason: 'unsafe-scheme' } });
    // The Markdown renderer empties `javascript:` and `data:` addresses before the policy sees them.
    expect(resolve('')).toEqual({ kind: 'inert', inert: { reason: 'unsafe-scheme', target: '' } });
  });
});

describe('documentation image policy', () => {
  it('never loads an image: alt text and the source, whatever the source', () => {
    expect(inertImage({ alt: ' Login flow ', src: 'img/flow.png', title: 'Flow' })).toEqual({
      alt: 'Login flow',
      source: 'img/flow.png',
      title: 'Flow',
    });
    expect(inertImage({ src: 'https://example.com/a.png' })).toEqual({
      alt: '',
      source: 'https://example.com/a.png',
    });
    expect(inertImage({ alt: 'x', src: '' })).toEqual({ alt: 'x' });
  });
});
