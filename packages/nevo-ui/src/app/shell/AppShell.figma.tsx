import { defineDesignComponent } from '@nevo/figma-core/authoring';
import { resolveWorkspacePixelSplit } from '../workspace/workspaceSizing';

const workspaceWidth = 1124;

/**
 * Intentional simplified Figma representation. Runtime layout remains
 * content/available-width driven. Product geometry belongs here rather than
 * in the generic exporter or importer.
 */
export const desktopFigmaProjection = {
  viewport: { width: 1400, height: 900 },
  navigation: { x: 0, y: 0, width: 260, height: 900 },
  workspace: { x: 276, y: 16, width: workspaceWidth, height: 884 },
  workspaceLayouts: {
    primary: resolveWorkspacePixelSplit(workspaceWidth, 'primary', true),
    balanced: resolveWorkspacePixelSplit(workspaceWidth, 'balanced', true),
    secondary: resolveWorkspacePixelSplit(workspaceWidth, 'secondary', true),
    single: resolveWorkspacePixelSplit(workspaceWidth, 'primary', false),
  },
} as const;

export const desktopAppViewport = desktopFigmaProjection.viewport;

export const designSpecs = [
  defineDesignComponent({
    component: 'AppShell',
    order: 20,
    variants: { viewport: ['desktop'] },
    defaults: { viewport: 'desktop' },
    slots: {
      navigation: { kind: 'slot', propertyName: 'Navigation', required: true },
      workspace: { kind: 'slot', propertyName: 'Workspace', required: true },
    },
    figma: {
      root: { ...desktopAppViewport, layoutMode: 'NONE' },
      slots: {
        navigation: { ...desktopFigmaProjection.navigation },
        workspace: { ...desktopFigmaProjection.workspace },
      },
    },
  }),
  defineDesignComponent({
    component: 'AppWorkspaceSlots',
    order: 25,
    variants: {
      layout: ['primary', 'balanced', 'secondary', 'single'],
    },
    defaults: { layout: 'balanced' },
    slots: {
      primary: { kind: 'slot', propertyName: 'Primary', required: true },
      secondary: { kind: 'slot', propertyName: 'Secondary' },
    },
    figma: {
      root: {
        width: desktopFigmaProjection.workspace.width,
        height: desktopFigmaProjection.workspace.height,
        layoutMode: 'HORIZONTAL',
        gap: 0,
      },
      variants: Object.fromEntries(
        Object.entries(desktopFigmaProjection.workspaceLayouts).map(([layout, widths]) => [
          layout,
          {
            slots: {
              primary: { width: widths.primary, height: desktopFigmaProjection.workspace.height },
              ...('secondary' in widths
                ? {
                    secondary: {
                      width: widths.secondary,
                      height: desktopFigmaProjection.workspace.height,
                    },
                  }
                : {}),
            },
          },
        ]),
      ),
    },
  }),
] as const;



