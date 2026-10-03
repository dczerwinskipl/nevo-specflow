import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = [
  readFileSync(new URL('../design-system.css', import.meta.url), 'utf8'),
  readFileSync(new URL('./brand-environment.generated.css', import.meta.url), 'utf8'),
].join('\n');

function colorToken(name: string, visited = new Set<string>()): string {
  if (visited.has(name)) throw new Error(`Circular color token reference: ${name}`);
  visited.add(name);
  const value = new RegExp(`--color-${name}:\\s*([^;]+);`, 'i').exec(css)?.[1]?.trim();
  if (/^#[0-9a-f]{6}$/i.test(value ?? '') || /^rgba?\(/i.test(value ?? '')) return value!;
  const reference = value?.match(/^var\(--color-([\w-]+)\)$/i)?.[1];
  if (reference) return colorToken(reference, visited);
  throw new Error(`Missing explicit color token: ${name}`);
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba {
  if (value.startsWith('#')) {
    return {
      r: Number.parseInt(value.slice(1, 3), 16),
      g: Number.parseInt(value.slice(3, 5), 16),
      b: Number.parseInt(value.slice(5, 7), 16),
      a: 1,
    };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${value}`);
  return { r: channels[0]!, g: channels[1]!, b: channels[2]!, a: channels[3] ?? 1 };
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function luminance(color: Rgba): number {
  const channels = [color.r, color.g, color.b].map((channel) => channel / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foregroundToken: string, backgroundToken: string): number {
  const canvas = parseColor(colorToken('canvas'));
  const background = composite(parseColor(colorToken(backgroundToken)), canvas);
  const foreground = composite(parseColor(colorToken(foregroundToken)), background);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe('WCAG 2.2 AA semantic color pairs', () => {
  it.each([
    ['primary content on canvas', 'content-primary', 'canvas'],
    ['secondary content on surface', 'content-secondary', 'surface-raised'],
    ['muted content on surface', 'content-muted', 'surface-raised'],
    ['placeholder content on a control', 'content-placeholder', 'surface-raised'],
    ['link content on canvas', 'content-link', 'canvas'],
    ['hovered link content on canvas', 'content-link-hover', 'canvas'],
    ['primary Button content', 'content-on-primary', 'action-primary'],
    ['secondary Button content', 'content-primary', 'action-secondary'],
    ['ghost Button content', 'content-muted', 'canvas'],
    ['destructive Button content', 'action-danger', 'canvas'],
    ['info status content', 'status-info', 'canvas'],
    ['success status content', 'status-success', 'canvas'],
    ['attention status content', 'status-attention', 'canvas'],
    ['danger status content', 'status-danger', 'canvas'],
  ])('%s has at least 4.5:1 text contrast', (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the shared focus indicator above 3:1 on dark surfaces', () => {
    expect(contrast('focus-ring', 'canvas')).toBeGreaterThanOrEqual(3);
    expect(contrast('focus-ring', 'surface-raised')).toBeGreaterThanOrEqual(3);
    expect(css).toContain('outline: 2px solid var(--color-focus-ring)');
  });
});
