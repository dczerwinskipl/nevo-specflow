import type { RowData } from '@tanstack/react-table';
import { EmptyState } from '../../feedback/EmptyState';
import type {
  DataTableAlign,
  DataTableCellContext,
  DataTableMessages,
  DataTableValueFormatter,
} from './DataTable.types';

export const defaultDataTableMessages: DataTableMessages = {
  booleanTrue: 'Yes',
  booleanFalse: 'No',
  columns: 'Columns',
  visibleColumns: 'Visible columns',
  selectAllRows: 'Select all rows',
  selectRow: (rowNumber) => `Select row ${rowNumber}`,
  activateRow: (rowNumber) => `Activate row ${rowNumber}`,
  resizeColumn: (label) => `Resize ${label} column`,
  sortBy: (label) => `Sort by ${label}`,
  emptyTitle: 'No data',
  emptyDescription: 'There are no records to display.',
  noResultsTitle: 'No matching results',
  noResultsDescription: 'Try changing or clearing the current filters.',
};

export function dataTableAlignClassName(align: DataTableAlign = 'start') {
  if (align === 'center') return 'text-center';
  if (align === 'end') return 'text-right';
  return 'text-left';
}

export function renderDataTableValue<TData extends RowData>(
  context: DataTableCellContext<TData>,
  messages: Readonly<DataTableMessages>,
  formatter?: DataTableValueFormatter<TData>,
) {
  if (formatter) return formatter(context, messages);
  const { value } = context;
  if (value === null || value === undefined || value === '') {
    return <span className="text-content-muted">—</span>;
  }
  if (typeof value === 'boolean') return value ? messages.booleanTrue : messages.booleanFalse;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '—';
}

export function defaultDataTableEmptyState(
  hasActiveFilters: boolean,
  messages: Readonly<DataTableMessages>,
) {
  return hasActiveFilters ? (
    <EmptyState
      className="min-h-44 border-0 bg-transparent"
      title={messages.noResultsTitle}
      description={messages.noResultsDescription}
    />
  ) : (
    <EmptyState
      className="min-h-44 border-0 bg-transparent"
      title={messages.emptyTitle}
      description={messages.emptyDescription}
    />
  );
}

const interactiveTableContent = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[data-table-interactive="true"]',
].join(',');

export function isInteractiveTableTarget(target: EventTarget | null, row: HTMLTableRowElement) {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(interactiveTableContent);
  return interactive !== null && row.contains(interactive);
}
