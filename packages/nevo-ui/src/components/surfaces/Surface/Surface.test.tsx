import { describe, expect, it } from 'vitest';
import { surfaceVariants } from './Surface';

describe('Surface', () => {
  it('maps semantic content layers without introducing layout', () => {
    expect(surfaceVariants({ tone: 'default' })).toContain('bg-surface');
    expect(surfaceVariants({ tone: 'raised' })).toContain('bg-surface-raised');
    expect(surfaceVariants({ tone: 'subtle' })).toContain('bg-surface-subtle');
    expect(surfaceVariants()).not.toContain('p-');
  });
});
