export const timelineSizes = ['sm', 'md'] as const;

export type TimelineSize = (typeof timelineSizes)[number];

export const timelineDefaults = {
  size: 'md',
} as const satisfies { size: TimelineSize };

