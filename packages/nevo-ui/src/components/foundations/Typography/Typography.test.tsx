import { describe, expect, it } from 'vitest';
import { typographyVariants } from './Typography';

describe('typographyVariants', () => {
  it('keeps the monospace family exclusive to code-md', () => {
    const code = typographyVariants({ variant: 'code-md' });
    expect(code).toContain('font-mono');
    expect(code).not.toContain('font-sans');
  });

  it('keeps the sans family on every other role', () => {
    expect(typographyVariants({ variant: 'body-md' })).toContain('font-sans');
    expect(typographyVariants({ variant: 'section-label' })).toContain('font-sans');
    expect(typographyVariants()).toContain('font-sans');
  });
});
