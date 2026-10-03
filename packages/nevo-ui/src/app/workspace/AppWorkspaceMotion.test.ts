import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('AppWorkspace motion CSS contract', () => {
  it('uses one transform-only forward entry with workspace motion tokens', async () => {
    const css = await readFile('src/app/workspace/AppWorkspace.css', 'utf8');
    const keyframes = /@keyframes workspace-enter-forward\s*{([\s\S]*?)\n}/.exec(css)?.[1];

    expect(css).toContain("[data-workspace-motion='entering'][data-workspace-direction='forward']");
    expect(css).toContain('@keyframes workspace-enter-forward');
    expect(css).toContain('@keyframes workspace-exit-backward');
    expect(css).toContain('var(--motion-duration-workspace-navigation)');
    expect(css).toContain('var(--motion-ease-workspace-navigation)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(keyframes).toBeDefined();
    expect(keyframes).toContain('translate3d(100%, 0, 0)');
    expect(keyframes).toContain('translate3d(0, 0, 0)');
    expect(keyframes).not.toContain('opacity');
    expect(css).not.toContain('workspace-secondary-arriving');
    expect(css).not.toContain('workspace-stack__layer--entering');
  });

  it('keeps desktop replacement static and mobile surfaces overlapping', async () => {
    const source = await readFile('src/app/workspace/AppWorkspace.tsx', 'utf8');

    expect(source).not.toContain('DesktopSurfaceContentTransition');
    expect(source).toContain('@container absolute inset-0');
    expect(source).toContain('bg-canvas bg-app-base');
  });
});
