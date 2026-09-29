import type { HTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '@nevo/ui';
import { NevoMark, type NevoMarkSize } from './NevoMark';
import { deriveNevoMarkPalette } from './palette';

export const defaultNevoBrand = {
  brand: 'nevo',
  coreColor: '#2b6bff',
  secondaryColor: '#21d7e8',
} as const;

export const nevoBrandLogoVariants = tv({
  base: 'inline-flex w-fit shrink-0 text-content-primary',
  variants: {
    appearance: {
      brand: '',
      monochrome: '',
    },
    type: {
      mark: 'items-center gap-0',
      horizontal: 'flex-row items-center',
      stacked: 'flex-col items-center',
      signature: 'flex-row items-center',
    },
    size: {
      sm: '',
      md: '',
      lg: '',
    },
  },
  compoundVariants: [
    { type: 'horizontal', size: 'sm', class: 'gap-2' },
    { type: 'horizontal', size: 'md', class: 'gap-1.5' },
    { type: 'horizontal', size: 'lg', class: 'gap-2' },
    { type: 'signature', size: 'sm', class: 'gap-1' },
    { type: 'signature', size: 'md', class: 'gap-1.5' },
    { type: 'signature', size: 'lg', class: 'gap-2' },
    { type: 'stacked', size: 'sm', class: 'gap-0.5' },
    { type: 'stacked', size: 'md', class: 'gap-1' },
    { type: 'stacked', size: 'lg', class: 'gap-1.5' },
  ],
  defaultVariants: { appearance: 'brand', type: 'mark', size: 'md' },
});

export type NevoBrandLogoType = NonNullable<VariantProps<typeof nevoBrandLogoVariants>['type']>;
export type NevoBrandLogoAppearance = 'brand' | 'monochrome';
export type NevoBrandLogoSlogan = string | readonly string[];

type NevoBrandLogoSharedProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  appearance?: NevoBrandLogoAppearance;
  coreColor?: string;
  secondaryColor?: string;
  size?: NevoMarkSize;
};

type NevoBrandLogoMarkProps = NevoBrandLogoSharedProps & {
  type: 'mark';
  brand?: never;
  product?: never;
  slogan?: never;
};

type NevoBrandLogoWordmarkProps = NevoBrandLogoSharedProps & {
  type: 'horizontal' | 'stacked';
  brand: string;
  product?: string;
  slogan?: never;
};

type NevoBrandLogoSignatureProps = NevoBrandLogoSharedProps & {
  type: 'signature';
  brand: string;
  product?: string;
  slogan: NevoBrandLogoSlogan;
};

export type NevoBrandLogoProps =
  NevoBrandLogoMarkProps | NevoBrandLogoWordmarkProps | NevoBrandLogoSignatureProps;

const wordmarkClasses = {
  sm: 'text-[0.9375rem] leading-none',
  md: 'text-base leading-none',
  lg: 'text-2xl leading-none',
} as const;

const productWeightClasses = {
  sm: 'font-medium',
  md: 'font-medium',
  lg: 'font-normal',
} as const;

export const nevoBrandLogoWordmarkPixelSizes = { sm: 14, md: 16, lg: 24 } as const;
export const nevoBrandLogoHorizontalMarkPixelSizes = { sm: 20, md: 28, lg: 42 } as const;

const sloganClasses = {
  sm: 'text-[0.4rem] tracking-[0.28em]',
  md: 'text-[0.55rem] tracking-[0.34em]',
  lg: 'text-[0.7rem] tracking-[0.4em]',
} as const;

export function NevoBrandLogo(props: NevoBrandLogoProps) {
  const {
    appearance = 'brand',
    brand: brandProp,
    className,
    coreColor = defaultNevoBrand.coreColor,
    product,
    secondaryColor = defaultNevoBrand.secondaryColor,
    size = 'md',
    slogan: sloganProp,
    type,
    ...htmlProps
  } = props;
  const brand = type === 'mark' ? undefined : brandProp;
  const slogan = type === 'signature' ? sloganProp : undefined;
  const sloganText = Array.isArray(slogan) ? slogan.join('\n') : slogan;
  const capture = useDesignMetadata('NevoBrandLogo', { appearance, size, type });
  const palette = deriveNevoMarkPalette({ coreColor, secondaryColor });
  const compactHorizontalMarkSize = nevoBrandLogoHorizontalMarkPixelSizes[size];
  const markStyle =
    type === 'horizontal'
      ? { height: compactHorizontalMarkSize, width: compactHorizontalMarkSize }
      : undefined;
  const mark =
    appearance === 'brand' ? (
      <NevoMark decorative palette={palette} size={size} style={markStyle} variant="brand" />
    ) : (
      <NevoMark decorative size={size} style={markStyle} variant="monochrome" />
    );

  return (
    <span
      aria-label={type === 'mark' ? defaultNevoBrand.brand : undefined}
      className={cn(nevoBrandLogoVariants({ appearance, size, type }), className)}
      role={type === 'mark' ? 'img' : undefined}
      {...htmlProps}
      {...capture}
    >
      <span className="inline-flex shrink-0" {...designSlot('NevoBrandLogo', 'mark')}>
        {mark}
      </span>
      {type === 'mark' ? null : (
        <span
          className={cn(
            'inline-flex min-w-0 flex-col gap-1',
            type === 'stacked' ? 'items-center text-center' : 'items-start',
          )}
        >
          <span className={cn('whitespace-nowrap tracking-normal', wordmarkClasses[size])}>
            <strong
              className="font-black"
              style={{
                fontFamily: '"Arial Rounded MT Bold", ui-rounded, "Trebuchet MS", sans-serif',
              }}
              {...designSlot('NevoBrandLogo', 'brand')}
            >
              {brand}
            </strong>
            {product ? (
              <>
                {' '}
                <span
                  className={productWeightClasses[size]}
                  style={{
                    color: appearance === 'brand' ? palette.ribbonMid : undefined,
                    fontFamily: '"Segoe UI Variable Display", "Aptos Display", Inter, sans-serif',
                  }}
                  {...designSlot('NevoBrandLogo', 'product')}
                >
                  {product}
                </span>
              </>
            ) : null}
          </span>
          {sloganText ? (
            <span
              className={cn(
                'whitespace-pre-line uppercase leading-[1.45] text-content-secondary',
                sloganClasses[size],
              )}
              {...designSlot('NevoBrandLogo', 'slogan')}
            >
              {sloganText}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
