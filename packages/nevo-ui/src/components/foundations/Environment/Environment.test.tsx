import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { workspaceSurfaceClassName } from '../../../design-system/brandEnvironment';
import { AppBackground, WorkspaceSurface } from './Environment';

describe('environment foundations', () => {
  it('applies derived AppBackground variables at the reusable root', () => {
    const html = renderToStaticMarkup(<AppBackground brandPrimary="#7c3aed" />);

    expect(html).toContain('--color-brand-primary:#7c3aed');
    expect(html).toContain('--background-image-app-base:radial-gradient');
  });

  it('uses the shared workspace material and keeps blur optional', () => {
    const runtime = renderToStaticMarkup(<WorkspaceSurface />);
    const capture = renderToStaticMarkup(<WorkspaceSurface blur={false} />);

    expect(runtime).toContain(workspaceSurfaceClassName);
    expect(runtime).toContain('workspace-surface-material');
    expect(runtime).not.toContain('bg-app-base');
    expect(runtime).toContain('backdrop-blur-sm');
    expect(capture).toContain(workspaceSurfaceClassName);
    expect(capture).not.toContain('backdrop-blur-sm');
  });

  it('keeps Storybook previews wired to the production foundations', async () => {
    const [appStory, workspaceStory] = await Promise.all([
      readFile('src/components/foundations/Environment/AppBackground.stories.tsx', 'utf8'),
      readFile('src/components/foundations/Environment/Workspace.stories.tsx', 'utf8'),
    ]);

    expect(appStory).toContain("from './Environment'");
    expect(workspaceStory).toContain("from './Environment'");
    expect(workspaceStory).toContain('<WorkspaceSurface');
  });
});
