import { describe, expect, it } from 'vitest';
import { productIcons } from '../../../shared/product-icons';
import { workOperationIcon } from './workOperationIcon';

describe('the icon of a tool operation', () => {
  it('marks a read with the file-read concept and an unknown kind as a tool action', () => {
    expect(workOperationIcon('read')).toBe(productIcons.fileRead);
    expect(workOperationIcon(undefined)).toBe(productIcons.toolAction);
  });

  it('never borrows the Document icon: a file the agent touched is not a Document', () => {
    const kinds = [
      'edit',
      'write',
      'command',
      'test',
      'read',
      'search',
      'list',
      'web',
      'other',
    ] as const;

    for (const kind of kinds) {
      expect([productIcons.document.item, productIcons.document.collection]).not.toContain(
        workOperationIcon(kind),
      );
    }
  });
});
