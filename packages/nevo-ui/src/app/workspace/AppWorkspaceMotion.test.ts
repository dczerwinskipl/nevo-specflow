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
    // No longer `'@container absolute inset-0'` (root-caused live on a real phone: `container-type`
    // — what the Tailwind `@container` utility sets — carries layout containment, which makes this
    // element a new containing block for its `position: fixed` descendants too, defeating the
    // mobile Composer overlay's "float above everything" intent several layers down — see this
    // div's own doc comment in `AppWorkspace.tsx`). Nothing in this package queries a container
    // scoped to this specific div, so dropping it is not a behavior change for anything that reads
    // a container query here.
    expect(source).toContain('absolute inset-0');
    expect(source).toContain('bg-canvas bg-app-base');
  });
});
