import { describe, expect, it } from 'vitest';

import {
  ancestorFolders,
  collidesIgnoringCase,
  deriveFolders,
  findCaseCollisions,
  isReservedRootName,
  parentFolder,
  validateDocumentPath,
  validateFolderPath,
  type DocumentPathViolation,
} from './document-paths';

const VALID: readonly string[] = [
  'overview.md',
  'research/notes.md',
  'a/b/c/d/e/f/g/h/file.md',
  'UPPER.MD',
  'spaces in name.md',
  'dots.in.name.txt',
  'zażółć/日本語.md',
  'a/specification.yaml',
  'conx.md',
  'console.md',
  'com10.md',
];

const INVALID: readonly (readonly [string, DocumentPathViolation])[] = [
  ['', 'empty'],
  ['/abs.md', 'absolute'],
  ['a//b.md', 'empty-segment'],
  ['a/', 'empty-segment'],
  ['../x.md', 'traversal'],
  ['a/../b.md', 'traversal'],
  ['.hidden.md', 'hidden-segment'],
  ['a/.git/config', 'hidden-segment'],
  ['./a.md', 'hidden-segment'],
  ['file.', 'trailing-dot-or-space'],
  ['file .md.', 'trailing-dot-or-space'],
  ['dir /file.md', 'trailing-dot-or-space'],
  ['trailing-space.md ', 'trailing-dot-or-space'],
  ['a\\b.md', 'forbidden-character'],
  ['a:b.md', 'forbidden-character'],
  ['a*b.md', 'forbidden-character'],
  ['a?b.md', 'forbidden-character'],
  ['a"b.md', 'forbidden-character'],
  ['a<b.md', 'forbidden-character'],
  ['a>b.md', 'forbidden-character'],
  ['a|b.md', 'forbidden-character'],
  ['a\u0000b.md', 'control-character'],
  ['a\nb.md', 'control-character'],
  ['a\tb.md', 'control-character'],
  ['a\u007fb.md', 'control-character'],
  ['zw\u200bsp.md', 'unaddressable-character'],
  ['bidi\u202eevil.md', 'unaddressable-character'],
  ['c1\u0085.md', 'control-character'],
  ['sep\u2028.md', 'unaddressable-character'],
  ['para\u2029.md', 'unaddressable-character'],
  ['rep\ufffd.md', 'unaddressable-character'],
  ['x\ud800.md', 'malformed-text'],
  ['lone\udc00low.md', 'malformed-text'],
  ['CON', 'device-name'],
  ['con.txt', 'device-name'],
  ['dir/NUL.md', 'device-name'],
  ['Aux', 'device-name'],
  ['prn.tar.gz', 'device-name'],
  ['com1', 'device-name'],
  ['LPT9.log', 'device-name'],
  ['specification.yaml', 'reserved-name'],
  ['Specification.YAML', 'reserved-name'],
  ['change.yaml', 'reserved-name'],
  ['CHANGE.Yaml', 'reserved-name'],
  ['a/b/c/d/e/f/g/h/i/file.md', 'too-deep'],
  ['x'.repeat(501), 'too-long'],
  ['x'.repeat(201), 'segment-too-long'],
  ['a/' + '\u20ac'.repeat(67), 'segment-too-long'],
];

describe('validateDocumentPath', () => {
  it.each(VALID)('accepts %s', (path) => {
    expect(validateDocumentPath(path)).toEqual({ ok: true, path });
  });

  it.each(INVALID)('rejects %j as %s', (path, violation) => {
    expect(validateDocumentPath(path)).toEqual({ ok: false, violation });
  });

  it('accepts depth 8 and rejects depth 9', () => {
    expect(validateDocumentPath('1/2/3/4/5/6/7/8/f.md').ok).toBe(true);
    expect(validateDocumentPath('1/2/3/4/5/6/7/8/9/f.md')).toEqual({
      ok: false,
      violation: 'too-deep',
    });
  });

  it('accepts exactly 500 characters and rejects 501', () => {
    const segments = ['x'.repeat(199), 'x'.repeat(199), 'x'.repeat(100)];
    expect(validateDocumentPath(segments.join('/')).ok).toBe(true);
    expect(validateDocumentPath(segments.join('/') + 'x').ok).toBe(false);
    expect(validateDocumentPath('x'.repeat(200)).ok).toBe(true);
    expect(validateDocumentPath('x'.repeat(201)).ok).toBe(false);
  });

  it('reserves specification.yaml and change.yaml only at the root', () => {
    expect(isReservedRootName('SPECIFICATION.yaml')).toBe(true);
    expect(isReservedRootName('overview.md')).toBe(false);
    expect(validateDocumentPath('docs/specification.yaml').ok).toBe(true);
  });
});

describe('validateFolderPath', () => {
  it('rejects the same unaddressable and malformed names as files', () => {
    expect(validateFolderPath('a\u200bb')).toEqual({
      ok: false,
      violation: 'unaddressable-character',
    });
    expect(validateFolderPath('x\ud800')).toEqual({ ok: false, violation: 'malformed-text' });
  });

  it('uses the same segment rules and a segment-count depth', () => {
    expect(validateFolderPath('1/2/3/4/5/6/7/8').ok).toBe(true);
    expect(validateFolderPath('1/2/3/4/5/6/7/8/9')).toEqual({ ok: false, violation: 'too-deep' });
    expect(validateFolderPath('')).toEqual({ ok: false, violation: 'empty' });
    expect(validateFolderPath('a/con')).toEqual({ ok: false, violation: 'device-name' });
    expect(validateFolderPath('Change.yaml')).toEqual({ ok: false, violation: 'reserved-name' });
  });
});

describe('folder derivation and case collisions', () => {
  it('computes parents and ancestors', () => {
    expect(parentFolder('a/b/c.md')).toBe('a/b');
    expect(parentFolder('c.md')).toBe('');
    expect(ancestorFolders('a/b/c.md')).toEqual(['a', 'a/b']);
    expect(ancestorFolders('c.md')).toEqual([]);
  });

  it('derives folders from files plus explicit folders, including empty ones', () => {
    expect(deriveFolders(['a/b/c.md', 'a/d.md', 'root.md'], ['research', 'x/y'])).toEqual([
      'a',
      'a/b',
      'research',
      'x',
      'x/y',
    ]);
  });

  it('finds paths equal ignoring case', () => {
    expect(findCaseCollisions(['A.md', 'a.md', 'b.md', 'A.md'])).toEqual([['A.md', 'a.md']]);
    expect(findCaseCollisions(['a.md', 'b.md'])).toEqual([]);
    expect(collidesIgnoringCase('README.md', ['readme.md'])).toBe(true);
    expect(collidesIgnoringCase('other.md', ['readme.md'])).toBe(false);
  });
});
