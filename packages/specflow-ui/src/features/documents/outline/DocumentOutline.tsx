import { useTranslation } from 'react-i18next';
import { Collapsible, Typography, cn } from '@nevo/ui';
import type { OutlineHeading } from './markdownOutline';

const indent = { 1: 'pl-0', 2: 'pl-3', 3: 'pl-6', 4: 'pl-9' } as const;

function Entries({
  headings,
  activeLine,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  activeLine?: number;
  onSelect: (line: number) => void;
}) {
  return (
    <ol className="grid gap-0.5">
      {headings.map((heading) => (
        <li key={heading.line} className={indent[heading.level]}>
          <a
            href={`#line-${heading.line}`}
            aria-current={heading.line === activeLine ? 'location' : undefined}
            className={cn(
              'block truncate rounded-control px-2 py-1 text-body-sm text-content-secondary no-underline hover:bg-surface-hover hover:text-content-primary',
              heading.line === activeLine && 'bg-surface-selected text-content-primary',
            )}
            onClick={(event) => {
              event.preventDefault();
              onSelect(heading.line);
            }}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * The headings of the previewed document as a list of links. `column` is the always-visible list
 * of a wide document panel; `collapsible` is the same list folded into a block above the text.
 */
export function DocumentOutline({
  headings,
  variant,
  activeLine,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  variant: 'column' | 'collapsible';
  activeLine?: number;
  onSelect: (line: number) => void;
}) {
  const { t } = useTranslation();
  const label = t('documents.outline.label');
  if (variant === 'column')
    return (
      <nav aria-label={label} className="min-w-0">
        <Typography as="p" variant="label-md" className="mb-2 px-2 text-content-muted">
          {label}
        </Typography>
        <Entries headings={headings} activeLine={activeLine} onSelect={onSelect} />
      </nav>
    );
  return (
    <nav aria-label={label} className="mb-4 min-w-0 rounded-composite border border-border-default">
      <Collapsible>
        <Collapsible.Trigger>
          <Typography as="span" variant="label-md">
            {label}
          </Typography>
          <Typography as="span" variant="body-sm" className="ml-2 text-content-muted">
            {headings.length}
          </Typography>
        </Collapsible.Trigger>
        <Collapsible.Content className="px-3 pb-2">
          <Entries headings={headings} activeLine={activeLine} onSelect={onSelect} />
        </Collapsible.Content>
      </Collapsible>
    </nav>
  );
}
