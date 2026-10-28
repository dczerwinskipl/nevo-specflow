import { describe, expect, it } from 'vitest';

import { DocumentError } from '../../document-rules/errors';
import { WINDOWS_ABSOLUTE_PATH_MAX } from '../../document-rules/limits';
import type { PlannedPath } from '../changes/plan/model';
import { assertPlanFitsWindows, DOCUMENT_TEMP_NAME_LENGTH } from './path-bound';

const written = (path: string): PlannedPath => ({
  path,
  role: 'document',
  pre: null,
  post: { sha256: 'a'.repeat(64), bytes: 1 },
  source: { kind: 'payload' },
});
const removed = (path: string): PlannedPath => ({
  path,
  role: 'document',
  pre: { sha256: 'a'.repeat(64), bytes: 1 },
  post: null,
  source: { kind: 'none' },
});

/** A checkout root of `length` characters. */
const root = (length: number): string => 'r'.repeat(length);

describe('assertPlanFitsWindows', () => {
  it('accepts a path exactly at the bound and refuses one character more, on win32 only', () => {
    const path = 'specs/active/s/' + 'f'.repeat(20) + '.md';
    const atBound = WINDOWS_ABSOLUTE_PATH_MAX - path.length - 1;
    const plan = { paths: [written(path)] };
    expect(() => assertPlanFitsWindows(root(atBound), plan, { platform: 'win32' })).not.toThrow();
    expect(() => assertPlanFitsWindows(root(atBound + 1), plan, { platform: 'win32' })).toThrow(
      DocumentError,
    );
    for (const platform of ['linux', 'darwin'] as const) {
      expect(() => assertPlanFitsWindows(root(atBound + 50), plan, { platform })).not.toThrow();
    }
  });

  it('reports path-too-long without the absolute path', () => {
    const plan = { paths: [written('a/b.md')] };
    try {
      assertPlanFitsWindows('C:-very-long-root-' + 'x'.repeat(300), plan, { platform: 'win32' });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'DOCUMENT_PATH_INVALID',
        details: { cause: 'path-too-long' },
      });
      expect((error as Error).message).not.toContain('very-long-root');
    }
  });

  it('judges the temporary sibling of a short name and ignores removals', () => {
    // a one-character file name still needs room for the fixed temporary name
    const short = { paths: [written('a/b.md')] };
    const atBound = WINDOWS_ABSOLUTE_PATH_MAX - ('a/'.length + DOCUMENT_TEMP_NAME_LENGTH) - 1;
    expect(() => assertPlanFitsWindows(root(atBound), short, { platform: 'win32' })).not.toThrow();
    expect(() => assertPlanFitsWindows(root(atBound + 1), short, { platform: 'win32' })).toThrow();
    const long = { paths: [removed('x/' + 'y'.repeat(400))] };
    expect(() => assertPlanFitsWindows(root(10), long, { platform: 'win32' })).not.toThrow();
  });
});
