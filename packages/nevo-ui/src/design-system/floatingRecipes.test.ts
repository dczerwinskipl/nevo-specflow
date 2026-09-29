import { describe, expect, it } from 'vitest';
import {
  floatingContentClassName,
  floatingItemVariants,
  floatingSurfaceClassName,
} from './floatingRecipes';

describe('floating recipes', () => {
  it('keeps the generic surface free from consumer width and padding', () => {
    expect(floatingSurfaceClassName).toContain('rounded-composite');
    expect(floatingSurfaceClassName).not.toMatch(/(?:^|\s)w-/);
    expect(floatingSurfaceClassName).not.toMatch(/(?:^|\s)p-/);
    expect(floatingContentClassName).toContain('p-1');
  });

  it('owns the shared Radix highlighted and disabled presentation', () => {
    const classes = floatingItemVariants();
    expect(classes).toContain('data-[highlighted]:bg-surface-hover');
    expect(classes).toContain('data-[highlighted]:text-content-primary');
    expect(classes).toContain('data-[disabled]:text-content-muted');
    expect(classes).toContain('data-[disabled]:opacity-50');
  });
});
