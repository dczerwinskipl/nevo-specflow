import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignMetadataProvider } from '@nevo/figma-capture/metadata';
import { AppShell, resolveAppShellLayout } from './AppShell';
import {
  APP_WORKSPACE_EDGE_BORDER,
  WIDE_SHELL_MIN_WIDTH,
  resolveWorkspaceContentWidth,
} from '../workspace/workspaceSizing';

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
      availableWidth: 1132,
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

  it('keeps transparent environment hosts out of capture metadata without public tooling props', () => {
    const markup = renderToStaticMarkup(
      <DesignMetadataProvider captureComponents={['AppShell']}>
        <AppShell navigation={<nav>Navigation</nav>}>
          <div>Workspace</div>
        </AppShell>
      </DesignMetadataProvider>,
    );

    expect(markup.match(/data-design-component=/g)).toHaveLength(1);
    expect(markup).toContain('data-design-component="AppShell"');
    expect(markup).not.toContain('data-design-component="AppBackground"');
    expect(markup).not.toContain('data-design-component="WorkspaceSurface"');
  });
});

describe('workspace content width', () => {
  it('subtracts the surface edge borders from the published slot width, not from thresholds', () => {
    for (const width of [1280, 1366, 1440, 1600]) {
      const { availableWidth, wide } = resolveAppShellLayout(width);
      expect(wide).toBe(true);
      expect(availableWidth).toBe(width - 268);
      expect(resolveWorkspaceContentWidth(availableWidth, { bordered: true, inset: false })).toBe(
        width - 268 - APP_WORKSPACE_EDGE_BORDER,
      );
    }
    expect(resolveWorkspaceContentWidth(1172, { bordered: true, inset: true })).toBe(1170);
  });

  it('leaves panel-owned (stacked) workspaces untouched', () => {
    expect(resolveWorkspaceContentWidth(480, { bordered: false, inset: false })).toBe(480);
    expect(
      resolveWorkspaceContentWidth(undefined, { bordered: true, inset: false }),
    ).toBeUndefined();
  });
});
