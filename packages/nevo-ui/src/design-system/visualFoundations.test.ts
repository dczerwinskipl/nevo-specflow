import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { actionVariantClasses } from './interactionRecipes';

describe('Nevo visual foundations', () => {
  it('defines the compact control scale and deliberate shape hierarchy', async () => {
    const css = await readFile('src/design-system.css', 'utf8');

    expect(css).toContain('--spacing-control-height-inline: 1.5rem');
    expect(css).toContain('--spacing-control-height-compact: 2rem');
    expect(css).toContain('--spacing-control-height-default: 2.25rem');
    expect(css).toContain('--radius-control-inline: 0.25rem');
    expect(css).toContain('--radius-control: 0.375rem');
    expect(css).toContain('--radius-composite: 0.75rem');
    expect(css).toContain('--radius-surface: 1rem');
    expect(css).toContain('--color-surface: rgba(255, 255, 255, 0.018)');
    expect(css).toContain('--color-workspace-material: rgba(255, 255, 255, 0.045)');
    expect(css).toContain('--color-workspace-edge: rgba(255, 255, 255, 0.12)');
    expect(css).toContain('--color-surface-control: rgba(255, 255, 255, 0.045)');
    expect(css).toContain('--color-action-danger-subtle: rgba(239, 68, 68, 0.05)');
    expect(css).toContain('--color-status-info: #60a5fa');
    expect(css).toContain('--motion-duration-fast: 120ms');
    expect(css).toContain('--motion-duration-normal: 150ms');
    expect(css).toContain('--motion-duration-workspace-navigation: 300ms');
    expect(css).toContain('--motion-ease-workspace-navigation: ease');
    expect(css).toContain('--motion-ease-standard: cubic-bezier(0.2, 0, 0, 1)');
  });

  it('keeps one semantic action hierarchy for labelled and icon-only actions', () => {
    expect(actionVariantClasses).toEqual({
      primary:
        'border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover',
      secondary:
        'border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary',
      ghost:
        'border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary',
      destructive:
        'border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle',
    });
  });
});

