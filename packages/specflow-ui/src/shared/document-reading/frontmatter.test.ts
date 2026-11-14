import { describe, expect, it } from 'vitest';
import { maxFrontmatterLength, parseFrontmatter } from './frontmatter';

const doc = (block: string, body = '# Title\n\nText') => `---\n${block}\n---\n${body}`;

describe('parseFrontmatter', () => {
  it('reads a flat mapping and stringifies scalars and lists', () => {
    const parsed = parseFrontmatter(
      doc('title: Ocena\nrevision: 3\napproved: false\nempty:\ntags: [a, b]'),
    );
    expect(parsed?.properties).toEqual([
      { key: 'title', value: 'Ocena' },
      { key: 'revision', value: '3' },
      { key: 'approved', value: 'false' },
      { key: 'empty', value: '' },
      { key: 'tags', value: 'a, b' },
    ]);
  });

  it('shows nested values compactly', () => {
    const parsed = parseFrontmatter(doc('owner:\n  name: Anna\n  team: platform\nlist:\n  - a: 1'));
    expect(parsed?.properties).toEqual([
      { key: 'owner', value: '{"name":"Anna","team":"platform"}' },
      { key: 'list', value: '[{"a":1}]' },
    ]);
  });

  it('accepts a CRLF file and the ... terminator', () => {
    const parsed = parseFrontmatter('---\r\ntitle: A\r\n...\r\n# Body');
    expect(parsed?.properties).toEqual([{ key: 'title', value: 'A' }]);
    expect(parsed?.lineCount).toBe(3);
  });

  it('keeps source line numbers: the block becomes the same number of empty lines', () => {
    const source = doc('a: 1\nb: 2', '# Heading\n\ntext');
    const parsed = parseFrontmatter(source)!;
    expect(parsed.lineCount).toBe(4);
    const original = source.split('\n');
    const body = parsed.body.split('\n');
    expect(body).toHaveLength(original.length);
    expect(body.indexOf('# Heading')).toBe(original.indexOf('# Heading'));
    expect(body.slice(0, parsed.lineCount).every((line) => line === '')).toBe(true);
  });

  it('returns null when there is no frontmatter', () => {
    expect(parseFrontmatter('# Title\n\ntext')).toBeNull();
    expect(parseFrontmatter('')).toBeNull();
    // Only a block at the very first line counts.
    expect(parseFrontmatter('\n---\na: 1\n---\n')).toBeNull();
    expect(parseFrontmatter(' ---\na: 1\n---\n')).toBeNull();
    expect(parseFrontmatter('----\na: 1\n---\n')).toBeNull();
    expect(parseFrontmatter('---a\na: 1\n---\n')).toBeNull();
  });

  it('returns null for an unclosed, empty or non-mapping block', () => {
    expect(parseFrontmatter('---\na: 1\n# Title')).toBeNull();
    expect(parseFrontmatter('---\n---\n# Title')).toBeNull();
    expect(parseFrontmatter('---\n\n  \n---\n# Title')).toBeNull();
    expect(parseFrontmatter('---\njust a sentence\n---\n')).toBeNull();
    expect(parseFrontmatter('---\n- a\n- b\n---\n')).toBeNull();
  });

  it('returns null for invalid YAML instead of throwing', () => {
    expect(parseFrontmatter('---\na: [1, 2\nb: : :\n---\nx')).toBeNull();
    expect(parseFrontmatter('---\n\t- tab\nkey: "unterminated\n---\nx')).toBeNull();
  });

  it('wraps nothing special for long values and many keys', () => {
    const long = 'x'.repeat(5000);
    expect(parseFrontmatter(doc(`long: ${long}`))?.properties[0]?.value).toBe(long);
    const many = Array.from({ length: 500 }, (_, index) => `k${index}: ${index}`).join('\n');
    expect(parseFrontmatter(doc(many))?.properties).toHaveLength(200);
  });

  it('ignores oversized blocks', () => {
    expect(parseFrontmatter(doc('a: ' + 'x'.repeat(maxFrontmatterLength)))).toBeNull();
  });

  it('survives malicious input: alias bombs, merge keys, prototype keys, huge nesting', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x]',
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c]',
      'e: &e [*d, *d, *d, *d, *d, *d, *d, *d, *d]',
      'f: [*e, *e, *e, *e, *e, *e, *e, *e, *e, *e, *e, *e]',
    ].join('\n');
    const started = Date.now();
    expect(() => parseFrontmatter(doc(bomb))).not.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(parseFrontmatter(doc('<<: {a: 1}\nb: 2'))?.properties.map((p) => p.key)).not.toContain(
      'a',
    );
    const proto = parseFrontmatter(doc('__proto__: x\nconstructor: y'));
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(proto === null || proto.properties.every((p) => typeof p.value === 'string')).toBe(true);
    expect(() => parseFrontmatter(doc('['.repeat(5000) + ']'.repeat(5000)))).not.toThrow();
    expect(() => parseFrontmatter(doc('!!js/function "x": 1\n!!binary x: y'))).not.toThrow();
  });

  it('does not interpret HTML or tags: values stay plain text', () => {
    const parsed = parseFrontmatter(doc('title: <script>alert(1)</script>'));
    expect(parsed?.properties[0]?.value).toBe('<script>alert(1)</script>');
  });
});
