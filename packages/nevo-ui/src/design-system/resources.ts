export const iconNames = [
  'search',
  'plus',
  'arrow-right',
  'trash',
  'close',
  'loader',
  'file',
  'file-search',
  'branch',
  'chevron-right',
  'chevron-down',
  'check',
  'save',
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
  'chat-plus',
  'minimize',
  'open-full',
  'info',
  'circle-check',
  'triangle-alert',
  'circle-alert',
  'users',
  'workflow',
  'list-checks',
  'list',
  'settings',
  'log-out',
  'refresh',
  'edit',
  'rename',
  'move',
  'upload',
  'download',
  'classify',
  'unlink',
  'wrap',
  'actual-size',
  'show-path',
  'undo',
  'image',
  'file-binary',
  'filter',
  'book-open',
  'network',
  'server',
  'list-ordered',
  'file-check',
  'book-user',
  'panels-top-left',
] as const;

/** `lg` and `xl` are illustration sizes (empty screens), drawn with a lighter stroke. */
export const iconSizes = ['sm', 'md', 'lg', 'xl'] as const;

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
