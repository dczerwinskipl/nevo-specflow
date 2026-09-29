import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell, resolveAppShellLayout } from './AppShell';
import { WIDE_SHELL_MIN_WIDTH } from '../workspace/workspaceSizing';

describe('AppShell', () => {
  it('does not assume a desktop layout before width is known during SSR or hydration', () => {
    const markup = renderToStaticMarkup(
      <AppShell navigation={<nav aria-label="Product">Navigation</nav>}>
        <div>Workspace</div>
      </AppShell>,
    );

    expect(markup).not.toContain('<aside');
    expect(markup).toContain('<main');
    expect(markup).toContain('data-app-shell-region="workspace"');
    expect(markup).toContain('data-app-shell-workspace-material-owner="panel"');
    expect(markup).not.toContain('workspace-surface-material');
  });

  it('leaves workspace material ownership to panels throughout stacked layouts', () => {
    for (const width of [390, 840, 900, WIDE_SHELL_MIN_WIDTH - 1]) {
      expect(resolveAppShellLayout(width)).toMatchObject({
        workspaceMaterialOwner: 'panel',
        wide: false,
      });
    }
    expect(resolveAppShellLayout(WIDE_SHELL_MIN_WIDTH).workspaceMaterialOwner).toBe('shell');
  });

  it('resolves narrow, wide, and bidirectional responsive transitions deterministically', () => {
    expect(resolveAppShellLayout(undefined).navigationMode).toBe('drawer');
    expect(resolveAppShellLayout(480)).toEqual({
      availableWidth: 480,
      navigationMode: 'drawer',
      workspaceMaterialOwner: 'panel',
      wide: false,
    });
    expect(resolveAppShellLayout(900)).toEqual({
      availableWidth: 900,
      navigationMode: 'drawer',
      workspaceMaterialOwner: 'panel',
      wide: false,
    });
    expect(resolveAppShellLayout(1400)).toEqual({
      availableWidth: 1124,
      navigationMode: 'persistent',
      workspaceMaterialOwner: 'shell',
      wide: true,
    });
    expect([480, 1400, 480].map((width) => resolveAppShellLayout(width).navigationMode)).toEqual([
      'drawer',
      'persistent',
      'drawer',
    ]);
  });

  it('composes the shared environment foundations without duplicating their material CSS', async () => {
    const source = await readFile('src/app/shell/AppShell.tsx', 'utf8');

    expect(source).toContain('<AppBackground');
    expect(source).toContain('<WorkspaceSurface');
    expect(source).not.toContain('bg-workspace-material');
    expect(source).not.toContain('bg-workspace ');
  });
});
