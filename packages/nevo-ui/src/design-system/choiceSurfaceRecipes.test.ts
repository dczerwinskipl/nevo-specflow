import { describe, expect, it } from 'vitest';
import {
  choiceSurfaceCheckClassName,
  choiceSurfaceClassName,
  choiceSurfaceTracksClassName,
} from './choiceSurfaceRecipes';

const classes = (value: string) => value.split(/\s+/).filter(Boolean);

describe('choice surface recipes', () => {
  it('leaves display and layout to the composition', () => {
    const surface = classes(choiceSurfaceClassName);
    for (const display of ['block', 'grid', 'flex', 'inline-flex', 'inline-block']) {
      expect(surface).not.toContain(display);
    }
  });

  it('reuses the global focus ring instead of re-implementing outlines', () => {
    expect(classes(choiceSurfaceClassName)).toContain('focus-ring-within');
    expect(choiceSurfaceClassName).not.toMatch(/outline-/);
  });

  it('expresses disabled with surface and border tokens only, without opacity', () => {
    expect(choiceSurfaceClassName).toContain(':has(input:disabled))]:bg-surface-subtle');
    expect(choiceSurfaceClassName).toContain(':has(input:disabled))]:border-border-subtle');
    expect(choiceSurfaceClassName).toContain(':has(input:disabled))]:cursor-not-allowed');
    expect(choiceSurfaceClassName).not.toMatch(/opacity/);
    // Hover is only declared for enabled choices.
    const hover = classes(choiceSurfaceClassName).filter((value) => value.includes(':hover'));
    expect(hover).toHaveLength(1);
    expect(hover[0]).toMatch(/^\[&:not\(:disabled\)/);
  });

  it('builds the icon / text / check tracks from icon tokens only', () => {
    expect(choiceSurfaceTracksClassName).toContain(
      'grid-cols-[var(--spacing-icon-md)_minmax(0,1fr)_var(--spacing-icon-md)]',
    );
    expect(choiceSurfaceTracksClassName).not.toMatch(/\d(?:px|rem)/);
  });
});

describe('choice surface containment and check slot', () => {
  it('contains visually hidden native inputs so focus never scrolls a workspace ancestor', () => {
    expect(classes(choiceSurfaceClassName)).toContain('relative');
  });

  it('centres the check slot vertically on the card', () => {
    expect(classes(choiceSurfaceCheckClassName)).toContain('self-center');
  });
});

describe('recipe source detection', () => {
  it.each(['choiceSurfaceRecipes.ts', 'treeRecipes.ts'])(
    '%s keeps class strings literal so Tailwind can detect them',
    async (file) => {
      const { readFile } = await import('node:fs/promises');
      const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toContain('${');
    },
  );
});
