import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, cn } from '@nevo/ui';
import type { OutlineHeading } from './markdownOutline';

/** Indentation per depth below the document's top heading level (column, sheet). */
const indent = {
  column: ['pl-0', 'pl-3', 'pl-6', 'pl-9'],
  sheet: ['pl-0', 'pl-4', 'pl-8', 'pl-12'],
} as const;

/**
 * The structure reads from the type: the top level is semibold, the next one medium, deeper
 * levels regular and quieter. Depth counts from the shallowest heading of the document, so a
 * document that starts at `##` still starts flush.
 */
const weight = [
  'font-semibold text-content-primary',
  'font-medium text-content-primary',
  'text-content-secondary',
  'text-content-secondary',
] as const;

/**
 * The headings as a list of links, one renderer for the column beside the text and for the sheet:
 * the same indentation, weight and current-section mark. The sheet has 44 px rows and wraps long
 * titles to two lines; the column keeps one truncated line (full title in the tooltip).
 */
export function OutlineEntries({
  headings,
  activeLine,
  variant,
  focusRef,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  activeLine?: number;
  variant: 'column' | 'sheet';
  /** Receives the entry to focus first: the current one, else the first one. */
  focusRef?: Ref<HTMLAnchorElement>;
  /** `pointer`: chosen with a mouse or a finger (a click with no detail is the keyboard). */
  onSelect: (line: number, pointer: boolean) => void;
}) {
  const top = Math.min(...headings.map((heading) => heading.level));
  const sheet = variant === 'sheet';
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-0.5 p-0">
      {headings.map((heading, index) => {
        const depth = Math.min(3, heading.level - top);
        const active = heading.line === activeLine;
        return (
          <li key={heading.line} className={cn('min-w-0', indent[variant][depth])}>
            <a
              ref={active || (activeLine === undefined && index === 0) ? focusRef : undefined}
              href={`#line-${heading.line}`}
              title={heading.text}
              aria-current={active ? 'location' : undefined}
              data-outline-depth={depth}
              className={cn(
                'block min-w-0 rounded-control no-underline hover:bg-surface-hover hover:text-content-primary',
                sheet
                  ? 'flex min-h-11 items-center px-3 py-2 text-body-md'
                  : 'truncate px-2 py-1 text-body-sm',
                weight[depth],
                active && 'bg-surface-selected text-content-primary',
              )}
              onClick={(event) => {
                event.preventDefault();
                onSelect(heading.line, event.detail > 0);
              }}
            >
              {sheet ? (
                <span className="line-clamp-2 min-w-0 break-words">{heading.text}</span>
              ) : (
                heading.text
              )}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The headings of the previewed document as a column of links, beside the text of a wide panel.
 * Narrower panels open the same list as a sheet (`DocumentOutlineSheet`).
 */
export function DocumentOutline({
  headings,
  activeLine,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  activeLine?: number;
  onSelect: (line: number, pointer: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t('documents.outline.label');
  return (
    <nav aria-label={label} className="min-w-0">
      <Typography as="p" variant="label-md" className="mb-2 px-2 text-content-muted">
        {label}
      </Typography>
      <OutlineEntries
        headings={headings}
        activeLine={activeLine}
        variant="column"
        onSelect={onSelect}
      />
    </nav>
  );
}
