export const statusTones = ['neutral', 'info', 'success', 'attention', 'danger'] as const;

export type StatusTone = (typeof statusTones)[number];
