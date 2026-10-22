import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hitAreaBlockClassName, hitAreaClassName } from './interactionRecipes';

const css = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');

describe('hit area recipes', () => {
  it('expands both axes to the runtime target size without moving layout', () => {
    expect(hitAreaClassName).toContain('relative');
    expect(hitAreaClassName).toContain('after:absolute');
    expect(hitAreaClassName).toContain('after:size-[max(100%,var(--target-size))]');
    expect(hitAreaClassName).toContain('after:-translate-x-1/2');
    expect(hitAreaClassName).toContain('after:-translate-y-1/2');
    expect(hitAreaClassName).toContain("after:content-['']");
  });

  it('expands only the block axis for text-width labels', () => {
    expect(hitAreaBlockClassName).toContain('after:inset-x-0');
    expect(hitAreaBlockClassName).toContain('after:h-[max(100%,var(--target-size))]');
    expect(hitAreaBlockClassName).not.toContain('after:size-');
  });

  it('defines 24px on every pointer and 44px on coarse pointers', () => {
    expect(css).toMatch(/--spacing-target-min:\s*1\.5rem;/);
    expect(css).toMatch(/--spacing-target-touch:\s*2\.75rem;/);
    expect(css).toMatch(/--target-size:\s*var\(--spacing-target-min\);/);
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*:root\s*\{\s*--target-size:\s*var\(--spacing-target-touch\);/,
    );
  });

  it('does not change visual control heights on coarse pointers', () => {
    const coarse = /@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(coarse).not.toContain('control-height');
  });
});
