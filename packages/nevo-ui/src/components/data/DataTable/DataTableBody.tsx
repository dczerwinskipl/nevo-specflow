import type { RowData } from '@tanstack/react-table';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { cn } from '../../../lib';
import { Skeleton } from '../../feedback/Skeleton';
import { dataTableBodyCellVariants } from './DataTable.styles';
import type { DataTableColumn, DataTableDensity, DataTableMessages } from './DataTable.types';
import { dataTableAlignClassName, isInteractiveTableTarget } from './DataTable.utils';
import type { DataTableInstance } from './useDataTable';

interface DataTableBodyProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  columns: ReadonlyMap<string, DataTableColumn<TData>>;
  density: DataTableDensity;
  loading: boolean;
  loadingRowCount: number;
  errorState?: ReactNode;
  emptyState: ReactNode;
  messages: Readonly<DataTableMessages>;
  getRowActionLabel?: (row: TData, rowIndex: number) => string;
  onRowClick?: (
    row: TData,
    event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
  ) => void;
}

export function DataTableBody<TData extends RowData>({
  table,
  columns,
  density,
  loading,
  loadingRowCount,
  errorState,
  emptyState,
  getRowActionLabel,
  messages,
  onRowClick,
}: DataTableBodyProps<TData>) {
  const rows = table.getRowModel().rows;
  const visibleColumnCount = Math.max(1, table.getVisibleLeafColumns().length);

  return (
    <tbody>
      {errorState ? (
        <tr>
          <td
            colSpan={visibleColumnCount}
            className="align-middle px-4 py-10 text-center text-body-sm text-content-error"
          >
            {errorState}
          </td>
        </tr>
      ) : loading ? (
        Array.from({ length: loadingRowCount }, (_, index) => (
          <tr key={`loading-${index}`} className="border-b border-divider last:border-b-0">
            {table.getVisibleLeafColumns().map((column) => (
              <td
                key={column.id}
                className={dataTableBodyCellVariants({ density })}
                style={{ width: column.getSize() }}
              >
                <Skeleton className="h-4 w-full max-w-48" />
              </td>
            ))}
          </tr>
        ))
      ) : rows.length === 0 ? (
        <tr>
          <td colSpan={visibleColumnCount} className="align-middle p-0">
            {emptyState}
          </td>
        </tr>
      ) : (
        rows.map((row) => (
          <tr
            key={row.id}
            data-selected={row.getIsSelected() ? 'true' : undefined}
            className={cn(
              'border-b border-divider transition-colors last:border-b-0',
              'hover:bg-surface-hover data-[selected=true]:bg-surface-selected',
              onRowClick &&
                'cursor-pointer outline-none focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
            )}
            aria-label={
              onRowClick
                ? (getRowActionLabel?.(row.original, row.index) ??
                  messages.activateRow(row.index + 1))
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
            onClick={
              onRowClick
                ? (event) => {
                    if (!isInteractiveTableTarget(event.target, event.currentTarget)) {
                      onRowClick(row.original, event);
                    }
                  }
                : undefined
            }
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (
                      (event.key === 'Enter' || event.key === ' ') &&
                      !isInteractiveTableTarget(event.target, event.currentTarget)
                    ) {
                      event.preventDefault();
                      onRowClick(row.original, event);
                    }
                  }
                : undefined
            }
          >
            {row.getVisibleCells().map((cell) => {
              const definition = columns.get(cell.column.id);
              return (
                <td
                  key={cell.id}
                  className={cn(
                    dataTableBodyCellVariants({ density }),
                    dataTableAlignClassName(definition?.align),
                  )}
                  style={{ width: cell.column.getSize() }}
                >
                  <div className="min-w-0 overflow-hidden text-ellipsis focus-within:overflow-visible">
                    <table.FlexRender cell={cell} />
                  </div>
                </td>
              );
            })}
          </tr>
        ))
      )}
    </tbody>
  );
}

