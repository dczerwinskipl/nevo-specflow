import { describe, expect, it } from 'vitest';
import { productIcons } from '../../../../shared/product-icons';
import { changeRowIcons } from './AttemptChanges';

describe("the icons of an attempt's changes", () => {
  it('mark changed repository files with their own concept, not the Document icon', () => {
    expect(changeRowIcons.files).toBe(productIcons.changedFiles);
    expect([productIcons.document.item, productIcons.document.collection]).not.toContain(
      changeRowIcons.files,
    );
    expect(changeRowIcons.tasks).toBe(productIcons.task.collection);
  });
});
