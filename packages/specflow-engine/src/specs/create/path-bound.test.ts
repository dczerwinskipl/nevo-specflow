import { describe, expect, it } from 'vitest';

import { documentErrorOf, ScaffoldValidationError } from '../scaffold';
import { assertCreatePathsFitWindows, WINDOWS_ABSOLUTE_PATH_MAX } from './path-bound';

const win32 = { platform: 'win32' } as const;

/** A workspace root of exactly `length` characters. */
const rootOf = (length: number): string => 'C:\\' + 'r'.repeat(length - 3);
/** A relative path of exactly `length` characters inside a folder, longer than its staged sibling. */
const pathOf = (length: number): string => 'specs/active/s/' + 'n'.repeat(length - 15);

function refusal(root: string, paths: string[]): ScaffoldValidationError {
  try {
    assertCreatePathsFitWindows(root, paths, win32);
  } catch (error) {
    if (error instanceof ScaffoldValidationError) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected a refusal.');
}

describe('Create Windows path bound', () => {
  it('accepts a path whose root + separator + relative path is exactly the bound', () => {
    const relative = pathOf(100);
    const root = rootOf(WINDOWS_ABSOLUTE_PATH_MAX - 1 - relative.length);
    expect(() => assertCreatePathsFitWindows(root, [relative], win32)).not.toThrow();
  });

  it('refuses one character above the bound as path-too-long, naming no absolute path', () => {
    const relative = pathOf(100);
    const root = rootOf(WINDOWS_ABSOLUTE_PATH_MAX - relative.length);
    const error = refusal(root, ['specs/active/s/specification.yaml', relative]);
    expect(error.cause).toEqual({
      kind: 'path-too-long',
      path: relative,
      max: WINDOWS_ABSOLUTE_PATH_MAX,
      actual: WINDOWS_ABSOLUTE_PATH_MAX + 1,
    });
    expect(error.message).not.toContain(root);
  });

  it('counts the staged sibling file of a short file name', () => {
    const root = rootOf(WINDOWS_ABSOLUTE_PATH_MAX - 1 - ('specs/active/s/'.length + 41) + 1);
    expect(refusal(root, ['specs/active/s/a.md']).cause).toMatchObject({ kind: 'path-too-long' });
  });

  it('does not apply on other platforms', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(() =>
        assertCreatePathsFitWindows(rootOf(500), [pathOf(300)], { platform }),
      ).not.toThrow();
    }
  });

  it('maps to DOCUMENT_PATH_INVALID with the path-too-long cause', () => {
    const error = documentErrorOf(refusal(rootOf(230), [pathOf(100)]));
    expect(error.code).toBe('DOCUMENT_PATH_INVALID');
    expect(error.details).toEqual({ cause: 'path-too-long' });
  });
});
