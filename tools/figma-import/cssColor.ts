export interface ParsedCssColor {
  r: number;
  g: number;
  b: number;
  opacity: number;
}

const clampUnit = (value: number) => Math.min(Math.max(value, 0), 1);

function parseHex(value: string): ParsedCssColor | null {
  const match = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return null;
  const source = match[1]!;
  const expanded =
    source.length <= 4 ? [...source].map((character) => character.repeat(2)).join('') : source;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
    opacity: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbChannel(value: string) {
  const parsed = Number.parseFloat(value);
  return clampUnit(value.endsWith('%') ? parsed / 100 : parsed / 255);
}

function parseAlpha(value: string | undefined) {
  if (value === undefined) return 1;
  const parsed = Number.parseFloat(value);
  return clampUnit(value.endsWith('%') ? parsed / 100 : parsed);
}

function parseRgb(value: string): ParsedCssColor | null {
  const match = value.match(/^rgba?\((.*)\)$/i);
  if (!match) return null;
  const normalized = match[1]!.replace(/\s*\/\s*/, ',');
  const channels = normalized.includes(',')
    ? normalized.split(',').map((part) => part.trim())
    : normalized.trim().split(/\s+/);
  if (
    channels.length < 3 ||
    channels.some((channel) => !Number.isFinite(Number.parseFloat(channel)))
  ) {
    return null;
  }
  return {
    r: parseRgbChannel(channels[0]!),
    g: parseRgbChannel(channels[1]!),
    b: parseRgbChannel(channels[2]!),
    opacity: parseAlpha(channels[3]),
  };
}

function linearToSrgb(value: number) {
  const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return clampUnit(encoded);
}

function parseOklch(value: string): ParsedCssColor | null {
  const match = value.match(
    /^oklch\(\s*([+-]?[\d.]+)(%)?\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:deg)?(?:\s*\/\s*([+-]?[\d.]+)(%)?)?\s*\)$/i,
  );
  if (!match) return null;
  const lightness = Number.parseFloat(match[1]!) / (match[2] ? 100 : 1);
  const chroma = Number.parseFloat(match[3]!);
  const hue = (Number.parseFloat(match[4]!) * Math.PI) / 180;
  if (![lightness, chroma, hue].every(Number.isFinite)) return null;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    opacity: parseAlpha(match[5] ? `${match[5]}${match[6] ?? ''}` : undefined),
  };
}

function parseOklab(value: string): ParsedCssColor | null {
  const match = value.match(
    /^oklab\(\s*([+-]?[\d.]+)(%)?\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:\s*\/\s*([+-]?[\d.]+)(%)?)?\s*\)$/i,
  );
  if (!match) return null;
  const lightness = Number.parseFloat(match[1]!) / (match[2] ? 100 : 1);
  const a = Number.parseFloat(match[3]!);
  const b = Number.parseFloat(match[4]!);
  if (![lightness, a, b].every(Number.isFinite)) return null;
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    opacity: parseAlpha(match[5] ? `${match[5]}${match[6] ?? ''}` : undefined),
  };
}

/** Parses the color formats emitted by the browser/Tailwind capture surface. */
export function parseCssColor(value: string | undefined): ParsedCssColor | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return { r: 0, g: 0, b: 0, opacity: 0 };
  return (
    parseHex(normalized) ?? parseRgb(normalized) ?? parseOklch(normalized) ?? parseOklab(normalized)
  );
}

