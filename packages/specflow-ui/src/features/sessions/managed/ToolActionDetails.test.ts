import { describe, expect, it } from 'vitest';
import { detailShape } from './ToolActionDetails';

describe('detailShape', () => {
  it('pretty-prints a JSON object', () => {
    expect(detailShape('{"pattern":"X","path":"src"}')).toEqual({
      kind: 'json',
      pretty: '{\n  "pattern": "X",\n  "path": "src"\n}',
    });
  });

  it('pretty-prints a JSON array', () => {
    expect(detailShape('[1,2]')).toEqual({ kind: 'json', pretty: '[\n  1,\n  2\n]' });
  });

  it('keeps non-JSON text verbatim, whitespace included', () => {
    const stdout = ' FAIL  test/a.test.mjs\n   AssertionError: x\n';
    expect(detailShape(stdout)).toEqual({ kind: 'text', text: stdout });
  });

  it('treats text that only looks like JSON but does not parse as verbatim text', () => {
    const text = '{ not json';
    expect(detailShape(text)).toEqual({ kind: 'text', text });
  });
});
