import type { ReactNode } from 'react';
import type { IconName, StatusTone } from '@nevo/ui';

export interface SemanticSupporting {
  readonly text: string;
  readonly tone?: StatusTone;
  readonly icon?: IconName;
  readonly iconClassName?: string;
  readonly textClassName?: string;
}

export type CompactFactItem =
  | string
  | {
      readonly text: string;
      readonly mono?: boolean;
      /** What assistive technology reads instead of the short visible `text` (`3 tasks` → …). */
      readonly accessibleText?: string;
      /**
       * Inline facts only: the fact truncates with an ellipsis beyond this CSS length (never wider
       * than the row). Without it an inline fact neither breaks nor truncates.
       */
      readonly maxWidth?: string;
      readonly dataAttributes?: Record<string, string | undefined>;
    };

export type CompactFacts =
  readonly [] | readonly [CompactFactItem] | readonly [CompactFactItem, CompactFactItem];

/** Facts of the inline layout: up to three, flowing on one line separated by `·`. */
export type InlineFacts =
  CompactFacts | readonly [CompactFactItem, CompactFactItem, CompactFactItem];

interface OperationalRowBaseProps {
  readonly primary: ReactNode;
  readonly primaryHref?: string;
  /** A framework-owned link, e.g. a TanStack Router Link, for primary navigation. */
  readonly primaryLink?: ReactNode;
  readonly onPrimaryClick?: (event: React.MouseEvent) => void;
  readonly primaryAriaLabel?: string;
  readonly supporting?: ReactNode | SemanticSupporting;
  readonly metadata?: ReactNode;
  readonly trailing?: ReactNode;
  readonly leading?: ReactNode;
  readonly interactive?: boolean;
  readonly selected?: boolean;
  readonly titleAs?: 'h2' | 'h3' | 'h4' | 'h5' | 'span';
  readonly className?: string;
  readonly dataAttributes?: Record<string, string | undefined>;
}

/**
 * `tracked` (default): at Wide the facts sit in shared column tracks, so they compare down a list.
 * `inline`: the facts flow on one line separated by `·` at every width and an absent fact takes no
 * space; the status is the last inline item at Wide and its own line at Narrow; the leading mark is
 * centred on the whole row. Chosen explicitly, never inferred from the fact count.
 */
export type OperationalRowProps = OperationalRowBaseProps &
  (
    | { readonly factsLayout?: 'tracked'; readonly compactFacts?: CompactFacts }
    | { readonly factsLayout: 'inline'; readonly compactFacts?: InlineFacts }
  );
