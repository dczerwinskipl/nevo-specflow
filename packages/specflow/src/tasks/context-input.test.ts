import { describe, expect, it } from 'vitest';

import { parseContextShorthand } from './context-input';

describe('parseContextShorthand', () => {
  it('maps each kind to a required entry', () => {
    expect(parseContextShorthand('spec-doc:overview')).toEqual({
      kind: 'specification-document',
      id: 'overview',
      required: true,
    });
    expect(parseContextShorthand('task-doc:task')).toEqual({
      kind: 'task-document',
      id: 'task',
      required: true,
    });
    expect(parseContextShorthand('project-doc:engineering.shared.testing')).toMatchObject({
      kind: 'project-document',
    });
    expect(parseContextShorthand('path:src/a.ts')).toEqual({
      kind: 'path',
      path: 'src/a.ts',
      required: true,
    });
  });

  it('keeps colons inside the value', () => {
    expect(parseContextShorthand('instructions:Mind this: it matters')).toEqual({
      kind: 'instructions',
      text: 'Mind this: it matters',
      required: true,
    });
  });

  it.each(['nokind', 'bogus:x', 'path:', 'path:  '])('rejects %j', (text) => {
    expect(() => parseContextShorthand(text)).toThrow(/kind/u);
  });
});
