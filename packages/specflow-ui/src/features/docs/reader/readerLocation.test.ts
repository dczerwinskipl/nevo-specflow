import { describe, expect, it } from 'vitest';
import {
  docsHref,
  hashOfSection,
  readerAddress,
  sectionFromHash,
  sessionOf,
  withoutSource,
} from './readerLocation';

describe('reader location', () => {
  it('reads the workspace and document of a reader address, and nothing of any other address', () => {
    expect(readerAddress('/docs')).toEqual({});
    expect(readerAddress('/workspaces/w%201/docs')).toEqual({ workspaceId: 'w 1' });
    expect(readerAddress('/workspaces/w/docs/a.b%2Fc/')).toEqual({
      workspaceId: 'w',
      documentId: 'a.b/c',
    });
    // Leaving the reader: the next screen's address is not read as `/docs`.
    expect(readerAddress('/')).toBeUndefined();
    expect(readerAddress('/specs/x')).toBeUndefined();
    expect(readerAddress('/workspaces/w/docsx')).toBeUndefined();
    expect(readerAddress('/workspaces/w/docs/a/b')).toBeUndefined();
  });

  it('round-trips section ids through the hash and builds encoded addresses', () => {
    const id = 'ui-interaction-model/back-and-close~2';
    expect(hashOfSection(undefined)).toBeUndefined();
    expect(sectionFromHash(`#${hashOfSection(id)!}`)).toBe(id);
    expect(sectionFromHash(hashOfSection(id)!)).toBe(id);
    expect(sectionFromHash('')).toBeUndefined();
    expect(sectionFromHash('#%E0%A4%A')).toBe('%E0%A4%A');
    expect(docsHref('w 1', 'a/b', id)).toBe(
      '/workspaces/w%201/docs/a%2Fb#ui-interaction-model%2Fback-and-close~2',
    );
    expect(docsHref('w')).toBe('/workspaces/w/docs');
  });

  it('keeps the way back to a Session and drops the one-time intent', () => {
    const entry = { source: 'pick' as const, sessionId: 's', sessionTitle: 'T', fromReader: true };
    expect(sessionOf(entry)).toEqual({ sessionId: 's', sessionTitle: 'T' });
    expect(sessionOf(undefined)).toEqual({});
    expect(withoutSource(entry)).toEqual({ sessionId: 's', sessionTitle: 'T', fromReader: true });
  });
});
