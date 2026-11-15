import { Typography, cn } from '@nevo/ui';

/** One quiet line under a context's name: its key, kind, state or why it cannot be chosen. */
export interface ContextSwitcherDetail {
  readonly text: string;
  /** `secondary` by default; `muted` for a side note, `attention` for why it cannot be chosen. */
  readonly tone?: 'secondary' | 'muted' | 'attention';
}

const toneClassName = {
  secondary: 'text-content-secondary',
  muted: 'text-content-muted',
  attention: 'text-status-attention',
} as const;

/** The detail lines of a trigger or an option, one per line. */
export function ContextSwitcherDetails({ details }: { details: readonly ContextSwitcherDetail[] }) {
  return details.map(({ text, tone = 'secondary' }, index) => (
    <Typography
      key={index}
      as="span"
      variant="body-sm"
      className={cn('block', toneClassName[tone])}
    >
      {text}
    </Typography>
  ));
}
