export type RgbColor = Readonly<{
    r: number;
    g: number;
    b: number;
}>;
export declare function normalizeHex(value: string): string;
export declare function rgbFromHex(value: string): RgbColor;
export declare function hexFromRgb({ r, g, b }: RgbColor): string;
export declare function mixRgb(source: RgbColor, target: RgbColor, amount: number): RgbColor;
export declare function rgba(color: RgbColor, alpha: number): string;
//# sourceMappingURL=color.d.ts.map