import { useTranslation } from 'react-i18next';
import { Typography, cn } from '@nevo/ui';
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
  onSelect: (line: number) => void;
}) {
  const { t } = useTranslation();
  const label = t('documents.outline.label');
  return (
    <nav aria-label={label} className="min-w-0">
      <Typography as="p" variant="label-md" className="mb-2 px-2 text-content-muted">
        {label}
      </Typography>
      <Entries headings={headings} activeLine={activeLine} onSelect={onSelect} />
    </nav>
  );
}
