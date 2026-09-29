import { useId, type SVGAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { nevoMarkAssetRef, type NevoMarkVariant } from './resources';
import { cn } from '@nevo/ui';
import { nevoMarkPaletteVariables, type NevoMarkPalette } from './palette';

export const nevoMarkDefaults = { size: 'md', variant: 'monochrome' } as const;
export const nevoMarkPixelSizes = { sm: 20, md: 32, lg: 64 } as const;
export const nevoMarkFoldShadowOpacity = { left: 0.8, right: 0.16 } as const;

export const nevoMarkVariants = tv({
  base: 'block shrink-0',
  variants: {
    size: {
      sm: 'size-5',
      md: 'size-8',
      lg: 'size-16',
    },
    variant: {
      brand: '',
      monochrome: 'text-current',
    },
  },
  defaultVariants: nevoMarkDefaults,
});

export type NevoMarkSize = NonNullable<VariantProps<typeof nevoMarkVariants>['size']>;
export type { NevoMarkVariant } from './resources';

type NevoMarkAccessibilityProps =
  | { decorative?: true; 'aria-label'?: never; title?: never }
  | { decorative: false; 'aria-label': string; title?: string };

type NevoMarkMaterialProps =
  { variant: 'brand'; palette: NevoMarkPalette } | { variant?: 'monochrome'; palette?: never };

export type NevoMarkProps = Omit<
  SVGAttributes<SVGSVGElement>,
  'aria-label' | 'children' | 'title' | 'viewBox'
> &
  NevoMarkAccessibilityProps & {
    size?: NevoMarkSize;
  } & NevoMarkMaterialProps;

export const nevoMarkGeometry = {
  leftBack:
    'M44 12C50.6274 12 56 17.3726 56 24V144C56 148.291 53.746 152.052 50.3594 154.174L50.3604 154.176L50.2705 154.231C50.2486 154.245 50.2271 154.259 50.2051 154.272L18.3604 174.176L18.3594 174.174C16.5152 175.329 14.3366 176 12 176C5.37258 176 0 170.627 0 164V44C0 39.7093 2.25321 35.9466 5.63965 33.8252L5.72852 33.7686C5.75059 33.755 5.77178 33.74 5.79395 33.7266L37.6396 13.8242C39.4839 12.6689 41.6633 12 44 12Z',
  rightBack:
    'M176 0C182.627 0 188 5.37258 188 12V132C188 136.291 185.746 140.052 182.359 142.174L182.36 142.176L182.271 142.231C182.249 142.245 182.227 142.259 182.205 142.272L150.36 162.176L150.359 162.174C148.515 163.329 146.337 164 144 164C137.373 164 132 158.627 132 152V32C132 27.7093 134.253 23.9466 137.64 21.8252L137.729 21.7686C137.751 21.755 137.772 21.74 137.794 21.7266L169.64 1.82422C171.484 0.66894 173.663 0 176 0Z',
  ribbon:
    'M55.9961 0C63.6183 0 70.4093 3.55434 74.8057 9.09473L74.9961 9L148.362 113.468L148.45 113.718C148.468 113.702 148.487 113.686 148.505 113.671L165.668 138.109C165.988 138.649 166.348 139.162 166.746 139.644C168.944 142.11 172.433 144 175.996 144C182.52 144 187.828 138.794 187.992 132.31C187.893 140.169 184.015 147.116 178.094 151.422C178.302 151.393 177.868 151.662 176.438 152.524C176.405 152.545 176.371 152.566 176.337 152.587L144.997 172.175C141.25 174.594 136.788 176 131.996 176C124.373 176 117.582 172.445 113.186 166.904L112.996 167L39.6279 62.5303L39.5732 62.2529C39.544 62.2779 39.5157 62.3042 39.4863 62.3291L22.3232 37.8906C22.003 37.3505 21.6434 36.8367 21.2451 36.3555C19.0473 33.89 15.5588 32 11.9961 32C5.47218 32 0.164199 37.2061 0 43.6904C0.108287 35.1248 4.70328 27.6409 11.543 23.4805C11.5678 23.4653 11.5925 23.4491 11.6182 23.4336L42.9941 3.82422C46.7408 1.40478 51.2044 5.1442e-05 55.9961 0Z',
} as const;

function gradientId(id: string, name: string) {
  return `nevo-logo-${name}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function NevoMarkAsset({
  variant,
  slot = false,
}: {
  variant: NevoMarkVariant;
  slot?: boolean;
}) {
  const id = useId();
  const capture = useDesignMetadata(
    'NevoMarkAsset',
    {},
    {
      assetRef: nevoMarkAssetRef(variant),
      assetRepresentation: variant === 'monochrome' ? 'svg-mask' : 'svg',
    },
  );
  const slotAttributes = slot ? designSlot('NevoMark', 'artwork') : {};
  const leftBackGradient = gradientId(id, 'back-left');
  const leftShadowGradient = gradientId(id, 'shadow-left');
  const rightBackGradient = gradientId(id, 'back-right');
  const rightShadowGradient = gradientId(id, 'shadow-right');
  const ribbonGradient = gradientId(id, 'ribbon');

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height="224"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 224 224"
      width="224"
      x="0"
      y="0"
      {...slotAttributes}
      {...capture}
    >
      <g transform="translate(18 24)">
        {variant === 'monochrome' ? (
          <>
            <path d={nevoMarkGeometry.leftBack} fill="currentColor" />
            <path d={nevoMarkGeometry.rightBack} fill="currentColor" />
            <path d={nevoMarkGeometry.ribbon} fill="currentColor" />
          </>
        ) : (
          <>
            <path d={nevoMarkGeometry.leftBack} fill={`url(#${leftBackGradient})`} />
            <path
              d={nevoMarkGeometry.leftBack}
              fill={`url(#${leftShadowGradient})`}
              fillOpacity={nevoMarkFoldShadowOpacity.left}
            />
            <path d={nevoMarkGeometry.rightBack} fill={`url(#${rightBackGradient})`} />
            <path
              d={nevoMarkGeometry.rightBack}
              fill={`url(#${rightShadowGradient})`}
              fillOpacity={nevoMarkFoldShadowOpacity.right}
            />
            <path d={nevoMarkGeometry.ribbon} fill={`url(#${ribbonGradient})`} />
            <defs>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={leftBackGradient}
                x1="28"
                x2="28"
                y1="12"
                y2="176"
              >
                <stop stopColor="var(--nevo-mark-back-start)" />
                <stop offset="0.5" stopColor="var(--nevo-mark-back-mid)" />
                <stop offset="1" stopColor="var(--nevo-mark-back-end)" />
              </linearGradient>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={leftShadowGradient}
                x1="28"
                x2="28"
                y1="12"
                y2="176"
              >
                <stop stopColor="var(--nevo-mark-shadow)" />
                <stop offset="0.5" stopColor="var(--nevo-mark-shadow)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--nevo-mark-shadow)" stopOpacity="0" />
              </linearGradient>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={rightBackGradient}
                x1="160"
                x2="160"
                y1="0"
                y2="164"
              >
                <stop stopColor="var(--nevo-mark-back-start)" />
                <stop offset="0.503118" stopColor="var(--nevo-mark-back-mid)" />
                <stop offset="1" stopColor="var(--nevo-mark-back-end)" />
              </linearGradient>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={rightShadowGradient}
                x1="160"
                x2="160"
                y1="0"
                y2="164"
              >
                <stop stopColor="var(--nevo-mark-shadow)" stopOpacity="0" />
                <stop offset="0.5" stopColor="var(--nevo-mark-shadow)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--nevo-mark-shadow)" />
              </linearGradient>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={ribbonGradient}
                x1="188"
                x2="0"
                y1="176"
                y2="0"
              >
                <stop stopColor="var(--nevo-mark-ribbon-end)" />
                <stop offset="0.49666" stopColor="var(--nevo-mark-ribbon-mid)" />
                <stop offset="1" stopColor="var(--nevo-mark-ribbon-start)" />
              </linearGradient>
            </defs>
          </>
        )}
      </g>
    </svg>
  );
}

export function NevoMark({
  size = nevoMarkDefaults.size,
  variant = nevoMarkDefaults.variant,
  decorative = true,
  className,
  palette,
  style,
  title,
  'aria-label': ariaLabel,
  ...props
}: NevoMarkProps) {
  const capture = useDesignMetadata('NevoMark', { size, variant });
  return (
    <svg
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : ariaLabel}
      className={cn(nevoMarkVariants({ size, variant }), className)}
      focusable="false"
      height="224"
      preserveAspectRatio="xMidYMid meet"
      role={decorative ? undefined : 'img'}
      style={
        variant === 'brand' && palette ? { ...nevoMarkPaletteVariables(palette), ...style } : style
      }
      viewBox="0 0 224 224"
      width="224"
      {...props}
      {...capture}
    >
      {!decorative && title ? <title>{title}</title> : null}
      <NevoMarkAsset slot variant={variant} />
    </svg>
  );
}
