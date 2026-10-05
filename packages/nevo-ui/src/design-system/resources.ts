export const iconNames = [
  'search',
  'plus',
  'arrow-right',
  'trash',
  'close',
  'loader',
  'file',
  'branch',
  'chevron-right',
  'chevron-down',
  'check',
  'inbox',
  'folder',
  'archive',
  'database',
  'calendar',
  'clock',
  'eye',
  'eye-off',
  'menu',
  'ellipsis',
  'chat',
  'minimize',
  'open-full',
  'info',
  'circle-check',
  'triangle-alert',
  'circle-alert',
  'users',
  'workflow',
  'list-checks',
  'settings',
  'log-out',
] as const;

export const iconSizes = ['sm', 'md'] as const;

export const typographyVariantNames = [
  'title-lg',
  'title-md',
  'title-sm',
  'body-lg',
  'body-md',
  'body-sm',
  'label-md',
  'label-sm',
  'section-label',
  'code-md',
] as const;

export type IconName = (typeof iconNames)[number];
export type IconSize = (typeof iconSizes)[number];
export type TypographyVariant = (typeof typographyVariantNames)[number];

export type IconAssetRef = `Icon/${IconName}/${IconSize}`;
export type TypographyTextStyleRef = `Typography/${TypographyVariant}`;

export function iconAssetRef(name: IconName, size: IconSize): IconAssetRef {
  return `Icon/${name}/${size}`;
}

export function typographyTextStyleRef(variant: TypographyVariant): TypographyTextStyleRef {
  return `Typography/${variant}`;
}
