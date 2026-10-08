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
      readonly dataAttributes?: Record<string, string | undefined>;
    };

export type CompactFacts =
  readonly [] | readonly [CompactFactItem] | readonly [CompactFactItem, CompactFactItem];

export interface OperationalRowProps {
  readonly primary: ReactNode;
  readonly primaryHref?: string;
  readonly onPrimaryClick?: (event: React.MouseEvent) => void;
  readonly primaryAriaLabel?: string;
  readonly compactFacts?: CompactFacts;
  readonly supporting?: ReactNode | SemanticSupporting;
  readonly metadata?: ReactNode;
  readonly trailing?: ReactNode;
  readonly leading?: ReactNode;
  readonly marker?: ReactNode;
  readonly interactive?: boolean;
  readonly selected?: boolean;
  readonly selectable?: boolean;
  readonly titleAs?: 'h2' | 'h3' | 'h4';
  readonly className?: string;
  readonly dataAttributes?: Record<string, string | undefined>;
}
