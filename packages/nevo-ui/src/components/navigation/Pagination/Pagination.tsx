import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Button } from '../../actions/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../forms/Select';
import { paginationPageItems } from './Pagination.model';
import type { PaginationLabels, PaginationProps } from './Pagination.types';

export type * from './Pagination.types';

export const defaultPaginationLabels: PaginationLabels = {
  navigation: 'Pagination',
  rows: 'Rows',
  rowsPerPage: 'Rows per page',
  previous: 'Previous',
  next: 'Next',
  page: (pageNumber) => `Page ${pageNumber}`,
  knownSummary: (start, end, total) => `${start}–${end} of ${total}`,
  unknownSummary: (pageNumber) => `Page ${pageNumber}`,
  cursorSummary: 'More results may be available',
};

function PageSizeControl({
  pageSize,
  options,
  onChange,
  labels,
}: {
  pageSize: number;
  options?: readonly number[];
  onChange?: (value: number) => void;
  labels: PaginationLabels;
}) {
  if (!options?.length || !onChange) return null;

  return (
    <div className="flex items-center gap-2 text-body-sm text-content-muted">
      <span>{labels.rows}</span>
      <Select value={String(pageSize)} onValueChange={(value) => onChange(Number(value))}>
        <SelectTrigger aria-label={labels.rowsPerPage} className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((value) => (
            <SelectItem key={value} value={String(value)}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NavigationButtons({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  labels,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  labels: PaginationLabels;
}) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={!hasPrevious} onClick={onPrevious}>
        {labels.previous}
      </Button>
      <Button size="sm" variant="secondary" disabled={!hasNext} onClick={onNext}>
        {labels.next}
      </Button>
    </div>
  );
}

export function Pagination(props: PaginationProps) {
  const labels = { ...defaultPaginationLabels, ...props.labels };
  const presentation =
    props.mode === 'known'
      ? (props.variant ?? 'pages') === 'pages'
        ? 'known-pages'
        : 'known-simple'
      : props.mode === 'unknown'
        ? 'unknown-simple'
        : 'cursor-simple';
  const capture = useDesignMetadata('Pagination', { presentation });
  if (props.mode === 'cursor') {
    return (
      <nav aria-label={labels.navigation} className={cn('min-w-0', props.className)} {...capture}>
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          {...designSlot('Pagination', 'content')}
        >
          <div className="text-body-sm text-content-muted">
            {props.summary ?? labels.cursorSummary}
          </div>
          <NavigationButtons
            hasPrevious={props.hasPreviousPage}
            hasNext={props.hasNextPage}
            onPrevious={props.onPrevious}
            onNext={props.onNext}
            labels={labels}
          />
        </div>
      </nav>
    );
  }

  const hasPrevious =
    props.mode === 'known' ? props.pageIndex > 0 : (props.hasPreviousPage ?? props.pageIndex > 0);
  const pageCount =
    props.mode === 'known' ? Math.max(1, Math.ceil(props.totalCount / props.pageSize)) : undefined;
  const hasNext =
    props.mode === 'known' ? props.pageIndex + 1 < (pageCount ?? 1) : props.hasNextPage;

  const start = props.pageIndex * props.pageSize + 1;
  const end =
    props.mode === 'known'
      ? Math.min(props.totalCount, start + props.pageSize - 1)
      : start + props.pageSize - 1;
  const summary =
    props.mode === 'known'
      ? labels.knownSummary(
          props.totalCount === 0 ? 0 : start,
          props.totalCount === 0 ? 0 : end,
          props.totalCount,
        )
      : (props.summary ?? labels.unknownSummary(props.pageIndex + 1));

  const previous = () => props.onPageChange(Math.max(0, props.pageIndex - 1));
  const next = () => props.onPageChange(props.pageIndex + 1);

  if (props.mode === 'known' && (props.variant ?? 'pages') === 'pages') {
    const items = paginationPageItems(props.pageIndex, pageCount ?? 1, props.siblingCount ?? 1);
    let ellipsisIndex = 0;

    return (
      <nav aria-label={labels.navigation} className={cn('min-w-0', props.className)} {...capture}>
        <div className="flex flex-wrap items-center gap-3" {...designSlot('Pagination', 'content')}>
          <PageSizeControl
            pageSize={props.pageSize}
            options={props.pageSizeOptions}
            onChange={props.onPageSizeChange}
            labels={labels}
          />
          <div className="ml-auto text-body-sm text-content-muted">{summary}</div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={!hasPrevious} onClick={previous}>
              {labels.previous}
            </Button>
            {items.map((item) => {
              if (item === 'ellipsis') {
                ellipsisIndex += 1;
                return (
                  <span
                    key={`ellipsis-${ellipsisIndex}`}
                    aria-hidden
                    className="inline-flex h-control-height-compact min-w-6 items-center justify-center px-1 text-body-sm text-content-muted"
                  >
                    …
                  </span>
                );
              }

              const selected = item === props.pageIndex;
              return (
                <Button
                  key={item}
                  size="sm"
                  variant="secondary"
                  aria-current={selected ? 'page' : undefined}
                  aria-label={labels.page(item + 1)}
                  className={cn(
                    'min-w-control-height-compact px-2',
                    selected && 'border-border-strong bg-surface-selected text-content-primary',
                  )}
                  onClick={() => props.onPageChange(item)}
                >
                  {item + 1}
                </Button>
              );
            })}
            <Button size="sm" variant="secondary" disabled={!hasNext} onClick={next}>
              {labels.next}
            </Button>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={labels.navigation} className={cn('min-w-0', props.className)} {...capture}>
      <div className="flex flex-wrap items-center gap-3" {...designSlot('Pagination', 'content')}>
        <PageSizeControl
          pageSize={props.pageSize}
          options={props.pageSizeOptions}
          onChange={props.onPageSizeChange}
          labels={labels}
        />
        <div className="ml-auto text-body-sm text-content-muted">{summary}</div>
        <NavigationButtons
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={previous}
          onNext={next}
          labels={labels}
        />
      </div>
    </nav>
  );
}
