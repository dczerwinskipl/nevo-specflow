import type { ReactNode } from 'react';
import { Typography } from '@nevo/ui';

/** A path or other code-like text: monospace, wrapping anywhere. */
export const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';

/** At most this many uncommitted files are named; the rest are counted. */
export const UNCOMMITTED_PATHS_SHOWN = 5;

/** One group of the Close dialog: a heading with its count, one sentence, then its content. */
export function Group({
  heading,
  headingContent,
  explanation,
  children,
}: {
  readonly heading: string;
  /** The heading's content when it holds more than text (a link); `heading` still names it. */
  readonly headingContent?: ReactNode;
  readonly explanation?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2" aria-label={heading}>
      <div className="grid gap-0.5">
        <Typography as="h3" variant="label-sm">
          {headingContent ?? heading}
        </Typography>
        {explanation ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {explanation}
          </Typography>
        ) : null}
      </div>
      {children}
    </section>
  );
}
