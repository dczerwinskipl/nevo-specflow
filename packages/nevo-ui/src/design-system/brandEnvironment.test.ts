import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BRAND_PRIMARY,
  deriveBrandEnvironment,
  renderBrandEnvironmentCss,
} from './brandEnvironment';

function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

function geometryOnly(value: string): string {
  return value.replace(/rgba?\([^)]*\)|#[\da-f]{6}/gi, '<color>');
}

describe('brand environment derivation', () => {
  it('derives parser-compatible background layers from one hex primary', () => {
    const environment = deriveBrandEnvironment();

    expect(environment.primary).toBe(DEFAULT_BRAND_PRIMARY);
    expect(splitLayers(environment.appBackgroundImage)).toHaveLength(2);
    expect(splitLayers(environment.workspaceBackgroundImage)).toHaveLength(1);
    expect(environment.appBackgroundImage).not.toContain('color-mix');
    expect(environment.workspaceBackgroundImage).toContain('at 0% 0%');
    expect(environment.workspaceBackgroundImage).not.toContain('43, 107, 255');
  });

  it('recolors the material without changing its geometry or stop positions', () => {
    const defaultEnvironment = deriveBrandEnvironment(DEFAULT_BRAND_PRIMARY);
    const violet = deriveBrandEnvironment('#7c3aed');

    expect(geometryOnly(violet.appBackgroundImage)).toBe(
      geometryOnly(defaultEnvironment.appBackgroundImage),
    );
    expect(geometryOnly(violet.workspaceBackgroundImage)).toBe(
      geometryOnly(defaultEnvironment.workspaceBackgroundImage),
    );
    expect(violet.appBackgroundImage).not.toBe(defaultEnvironment.appBackgroundImage);
    expect(violet.workspaceBackgroundImage).toBe(defaultEnvironment.workspaceBackgroundImage);
  });

  it('keeps the generated theme synchronized with the derivation source', async () => {
    const generated = await readFile(
      path.resolve('src/design-system/brand-environment.generated.css'),
      'utf8',
    );

    expect(generated).toBe(renderBrandEnvironmentCss());
  });

  it('rejects inputs that cannot resolve to explicit RGB values', () => {
    expect(() => deriveBrandEnvironment('var(--unknown)')).toThrow(/hex value/);
  });
});
