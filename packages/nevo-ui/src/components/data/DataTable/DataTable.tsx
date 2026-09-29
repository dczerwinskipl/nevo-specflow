import type { RowData } from '@tanstack/react-table';
import { useMemo } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { ScrollArea } from '../../layout/ScrollArea';
import { DataTableBody } from './DataTableBody';
import { DataTableColumnVisibility } from './DataTableColumnVisibility';
import { DataTableHeader } from './DataTableHeader';
import type { DataTableProps } from './DataTable.types';
import { defaultDataTableEmptyState, defaultDataTableMessages } from './DataTable.utils';
import { useDataTable } from './useDataTable';
import './DataTable.css';

export type * from './DataTable.types';

export function DataTable<TData extends RowData>({
  data,
  columns,
  className,
  tableClassName,
  density = 'default',
  toolbar,
  showColumnVisibility = false,
  messages: messagesProp,
  valueFormatter,
  loading = false,
  loadingRowCount = 5,
  errorState,
  emptyState,
  noResultsState,
  hasActiveFilters = false,
  getRowId,
  getRowActionLabel,
  onRowClick,
  enableRowSelection = false,
  rowSelection,
  defaultRowSelection = {},
  onRowSelectionChange,
  sorting,
  defaultSorting = [],
  onSortingChange,
  manualSorting = false,
  columnVisibility,
  defaultColumnVisibility = {},
  onColumnVisibilityChange,
  columnSizing,
  defaultColumnSizing = {},
  onColumnSizingChange,
}: DataTableProps<TData>) {
  const messages = useMemo(
    () => ({ ...defaultDataTableMessages, ...messagesProp }),
    [messagesProp],
  );
  const { table, columnById } = useDataTable({
    data,
    columns,
    getRowId,
    enableRowSelection,
    rowSelection,
    defaultRowSelection,
    onRowSelectionChange,
    sorting,
    defaultSorting,
    onSortingChange,
    manualSorting,
    columnVisibility,
    defaultColumnVisibility,
    onColumnVisibilityChange,
    columnSizing,
    defaultColumnSizing,
    onColumnSizingChange,
    messages,
    valueFormatter,
  });

  const designState = loading
    ? 'loading'
    : data.length === 0
      ? 'empty'
      : Object.keys(table.state.rowSelection).length > 0
        ? 'selected'
        : table.state.sorting.length > 0
          ? 'sorted'
          : 'default';
  const capture = useDesignMetadata('DataTable', { density, state: designState });
  const resolvedEmptyState = hasActiveFilters
    ? noResultsState === undefined
      ? defaultDataTableEmptyState(true, messages)
      : noResultsState
    : emptyState === undefined
      ? defaultDataTableEmptyState(false, messages)
      : emptyState;
  const columnVisibilityControl = showColumnVisibility ? (
    <DataTableColumnVisibility
      table={table}
      columns={columnById}
      label={messages.columns}
      visibleColumnsLabel={messages.visibleColumns}
    />
  ) : null;

  return (
    <div className={cn('grid min-w-0 gap-3', className)} data-density={density} {...capture}>
      {toolbar || columnVisibilityControl ? (
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {columnVisibilityControl}
        </div>
      ) : null}

      <div
        className="min-w-0 overflow-hidden rounded-composite border border-border-subtle bg-surface"
        {...designSlot('DataTable', 'content')}
      >
        <ScrollArea
          className="min-w-0"
          contentClassName="min-w-full"
          direction="horizontal"
          viewportClassName="data-table-scroll min-w-0"
        >
          <table
            className={cn(
              'w-full table-fixed border-collapse text-body-sm text-content-primary',
              tableClassName,
            )}
            style={{ minWidth: table.getTotalSize() }}
          >
            <DataTableHeader
              table={table}
              columns={columnById}
              density={density}
              messages={messages}
            />
            <DataTableBody
              table={table}
              columns={columnById}
              density={density}
              loading={loading}
              loadingRowCount={loadingRowCount}
              errorState={errorState}
              emptyState={resolvedEmptyState}
              getRowActionLabel={getRowActionLabel}
              messages={messages}
              onRowClick={onRowClick}
            />
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}



