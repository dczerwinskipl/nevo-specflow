import { rgbFromHex } from '@nevo/ui/design-system/color';

export interface NevoMarkPalette {
  ribbonStart: string;
  ribbonMid: string;
  ribbonEnd: string;
  backStart: string;
  backMid: string;
  backEnd: string;
  shadow: string;
}

export interface NevoMarkPaletteSeed {
  coreColor: string;
  secondaryColor?: string;
}

interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export const nevoMarkCssVariables = {
  ribbonStart: '--nevo-mark-ribbon-start',
  ribbonMid: '--nevo-mark-ribbon-mid',
  ribbonEnd: '--nevo-mark-ribbon-end',
  backStart: '--nevo-mark-back-start',
  backMid: '--nevo-mark-back-mid',
  backEnd: '--nevo-mark-back-end',
  shadow: '--nevo-mark-shadow',
} as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function srgbToLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function hexToOklch(value: string): OklchColor {
  const rgb = rgbFromHex(value);
  const [red, green, blue] = [rgb.r, rgb.g, rgb.b].map((channel) => srgbToLinear(channel / 255));
  const l = 0.4122214708 * red! + 0.5363325363 * green! + 0.0514459929 * blue!;
  const m = 0.2119034982 * red! + 0.6806995451 * green! + 0.1073969566 * blue!;
  const s = 0.0883024619 * red! + 0.2817188376 * green! + 0.6299787005 * blue!;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  return {
    l: lightness,
    c: Math.hypot(a, b),
    h: normalizeHue((Math.atan2(b, a) * 180) / Math.PI),
  };
}

function oklchToLinearRgb({ l, c, h }: OklchColor) {
  const angle = (normalizeHue(h) * Math.PI) / 180;
  const a = c * Math.cos(angle);
  const b = c * Math.sin(angle);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const linearL = lRoot ** 3;
  const linearM = mRoot ** 3;
  const linearS = sRoot ** 3;
  return [
    4.0767416621 * linearL - 3.3077115913 * linearM + 0.2309699292 * linearS,
    -1.2684380046 * linearL + 2.6097574011 * linearM - 0.3413193965 * linearS,
    -0.0041960863 * linearL - 0.7034186147 * linearM + 1.707614701 * linearS,
  ];
}

function isInSrgbGamut(channels: readonly number[]) {
  return channels.every((channel) => channel >= -0.000001 && channel <= 1.000001);
}

function gamutMappedRgb(color: OklchColor) {
  const normalized = {
    l: clamp(color.l, 0, 1),
    c: clamp(color.c, 0, 0.4),
    h: normalizeHue(color.h),
  };
  let channels = oklchToLinearRgb(normalized);
  if (!isInSrgbGamut(channels)) {
    let lower = 0;
    let upper = normalized.c;
    for (let index = 0; index < 24; index += 1) {
      const candidate = (lower + upper) / 2;
      const candidateChannels = oklchToLinearRgb({ ...normalized, c: candidate });
      if (isInSrgbGamut(candidateChannels)) {
        lower = candidate;
        channels = candidateChannels;
      } else {
        upper = candidate;
      }
    }
  }
  return channels.map((channel) => clamp(linearToSrgb(clamp(channel, 0, 1)), 0, 1));
}

function toHex(color: OklchColor) {
  return `#${gamutMappedRgb(color)
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function transform(
  primary: OklchColor,
  lightnessOffset: number,
  chromaMultiplier: number,
  hueOffset: number,
) {
  return toHex({
    l: clamp(primary.l + lightnessOffset, 0, 1),
    c: clamp(primary.c * chromaMultiplier, 0, 0.4),
    h: normalizeHue(primary.h + hueOffset),
  });
}

function ribbonHueOffsets(hue: number) {
  if (hue >= 130 && hue < 210) {
    return [-28, -10, 10] as const;
  }
  if (hue >= 210 && hue < 280) {
    return [-85, -50, 10] as const;
  }
  if (hue >= 280 && hue < 335) {
    return [-35, -20, 10] as const;
  }
  return [-28, -10, 10] as const;
}

function deriveBackColor(
  ribbonColor: string,
  lightnessOffset: number,
  chromaMultiplier: number,
  hueOffset: number,
) {
  return transform(hexToOklch(ribbonColor), lightnessOffset, chromaMultiplier, hueOffset);
}

function mixOklch(first: OklchColor, second: OklchColor, amount: number): OklchColor {
  const hueDelta = ((second.h - first.h + 540) % 360) - 180;
  return {
    l: first.l + (second.l - first.l) * amount,
    c: first.c + (second.c - first.c) * amount,
    h: normalizeHue(first.h + hueDelta * amount),
  };
}

/** Derives the private mark material from one or two identity color seeds. */
export function deriveNevoMarkPalette({
  coreColor,
  secondaryColor,
}: NevoMarkPaletteSeed): NevoMarkPalette {
  const primary = hexToOklch(coreColor);
  if (secondaryColor) {
    const secondary = hexToOklch(secondaryColor);
    const middle = mixOklch(primary, secondary, 0.5);
    const ribbonStart = toHex(primary);
    const ribbonMid = toHex({
      l: clamp(middle.l + 0.02, 0, 1),
      c: clamp(middle.c * 1.08, 0, 0.4),
      h: middle.h,
    });
    const ribbonEnd = toHex(secondary);
    const shadowBase = mixOklch(primary, secondary, 0.35);
    return {
      ribbonStart,
      ribbonMid,
      ribbonEnd,
      backStart: deriveBackColor(ribbonStart, -0.14, 0.72, 2),
      backMid: deriveBackColor(ribbonMid, -0.16, 0.68, 1),
      backEnd: deriveBackColor(ribbonEnd, -0.13, 0.74, -1),
      shadow: toHex({ l: 0.18, c: Math.min(shadowBase.c * 0.25, 0.04), h: shadowBase.h }),
    };
  }
  const hueOffsets = ribbonHueOffsets(primary.h);
  const ribbonStart = transform(primary, 0.12, 1, hueOffsets[0]);
  const ribbonMid = transform(primary, 0.06, 1.05, hueOffsets[1]);
  const ribbonEnd = transform(primary, -0.05, 1.05, hueOffsets[2]);
  return {
    ribbonStart,
    ribbonMid,
    ribbonEnd,
    backStart: deriveBackColor(ribbonStart, -0.14, 0.72, 2),
    backMid: deriveBackColor(ribbonMid, -0.16, 0.68, 1),
    backEnd: deriveBackColor(ribbonEnd, -0.13, 0.74, -1),
    shadow: toHex({ l: 0.18, c: Math.min(primary.c * 0.25, 0.04), h: primary.h }),
  };
}

export function nevoMarkPaletteVariables(palette: NevoMarkPalette) {
  return Object.fromEntries(
    Object.entries(nevoMarkCssVariables).map(([name, variable]) => [
      variable,
      palette[name as keyof NevoMarkPalette],
    ]),
  ) as Record<(typeof nevoMarkCssVariables)[keyof typeof nevoMarkCssVariables], string>;
}
