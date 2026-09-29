export type RgbColor = Readonly<{ r: number; g: number; b: number }>;

export function normalizeHex(value: string): string {
  const compact = value.trim().toLowerCase();
  const short = compact.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[\da-f]{6}$/i.test(compact)) return compact;
  throw new Error(`Brand color must be a three- or six-digit hex value. Received: ${value}`);
}

export function rgbFromHex(value: string): RgbColor {
  const normalized = normalizeHex(value);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function hexFromRgb({ r, g, b }: RgbColor): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function mixRgb(source: RgbColor, target: RgbColor, amount: number): RgbColor {
  const ratio = Math.min(Math.max(amount, 0), 1);
  return {
    r: source.r + (target.r - source.r) * ratio,
    g: source.g + (target.g - source.g) * ratio,
    b: source.b + (target.b - source.b) * ratio,
  };
}

export function rgba(color: RgbColor, alpha: number): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

