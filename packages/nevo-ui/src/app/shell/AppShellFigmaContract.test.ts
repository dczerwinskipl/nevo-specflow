import { describe, expect, it } from 'vitest';
import { designSpecs, desktopFigmaProjection } from './AppShell.figma';

describe('AppShell Figma contract', () => {
  it('authors one explicit simplified desktop projection without changing runtime sizing', () => {
    expect(desktopFigmaProjection).toMatchObject({
      viewport: { width: 1400, height: 900 },
      navigation: { x: 0, y: 0, width: 260, height: 900 },
      workspace: { x: 276, y: 16, width: 1124, height: 884 },
      workspaceLayouts: {
        primary: { primary: 843, secondary: 281 },
        balanced: { primary: 562, secondary: 562 },
        secondary: { primary: 281, secondary: 843 },
        single: { primary: 1124 },
      },
    });
    expect(designSpecs.find((spec) => spec.component === 'AppShell')?.figma?.root?.layoutMode).toBe(
      'NONE',
    );
  });
});

