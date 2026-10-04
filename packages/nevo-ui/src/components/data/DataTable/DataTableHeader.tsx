import type { RowData } from '@tanstack/react-table';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import {
  DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH,
  DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH,
  DATA_TABLE_KEYBOARD_RESIZE_STEP,
  dataTableHeaderCellVariants,
} from './DataTable.styles';
import type { DataTableColumn, DataTableDensity, DataTableMessages } from './DataTable.types';
import { dataTableAlignClassName } from './DataTable.utils';
import type { DataTableInstance } from './useDataTable';

interface DataTableHeaderProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  columns: ReadonlyMap<string, DataTableColumn<TData>>;
  density: DataTableDensity;
  messages: Readonly<DataTableMessages>;
}

export function DataTableHeader<TData extends RowData>({
  table,
  columns,
  density,
  messages,
}: DataTableHeaderProps<TData>) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-subtle">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} className="border-b border-divider">
          {headerGroup.headers.map((header) => {
            const definition = columns.get(header.column.id);
            const alignment = definition?.align ?? 'start';
            const sorted = header.column.getIsSorted();
            const label =
              definition?.label ??
              (typeof definition?.header === 'string' ? definition.header : header.column.id);
            const minimum = header.column.columnDef.minSize ?? DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH;
            const maximum = header.column.columnDef.maxSize ?? DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH;

            const resizeBy = (delta: number) => {
              table.setColumnSizing((previous) => {
                const current = previous[header.column.id] ?? header.column.getSize();
                return {
                  ...previous,
                  [header.column.id]: Math.min(maximum, Math.max(minimum, current + delta)),
                };
              });
            };

            return (
              <th
                key={header.id}
                colSpan={header.colSpan}
                aria-sort={
                  sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                }
                className={cn(
                  dataTableHeaderCellVariants({ density }),
                  dataTableAlignClassName(alignment),
                )}
                style={{ width: header.getSize() }}
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-control-inline text-inherit outline-none hover:text-content-primary',
                      alignment === 'end' && 'ml-auto',
                      alignment === 'center' && 'mx-auto',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-label={messages.sortBy(label)}
                  >
                    <span className="min-w-0 truncate">
                      <table.FlexRender header={header} />
                    </span>
                    {sorted ? (
                      <Icon
                        name="chevron-down"
                        size="sm"
                        className={cn('text-content-muted', sorted === 'asc' && 'rotate-180')}
                      />
                    ) : null}
                  </button>
                ) : (
                  <>
                    <table.FlexRender header={header} />
                    {typeof definition?.header === 'string' && definition.header.trim() === '' ? (
                      <span className="sr-only">{label}</span>
                    ) : null}
                  </>
                )}

                {header.column.getCanResize() ? (
                  <div
                    role="separator"
                    aria-label={messages.resizeColumn(label)}
                    aria-orientation="vertical"
                    aria-valuemin={minimum}
                    aria-valuemax={maximum}
                    aria-valuenow={Math.round(header.column.getSize())}
                    tabIndex={0}
                    className={cn(
                      'absolute inset-y-0 right-0 w-3 cursor-col-resize touch-none outline-none',
                      'after:absolute after:inset-y-1.5 after:right-0 after:w-px after:bg-transparent hover:after:bg-border-strong focus-visible:after:bg-focus-ring',
                      header.column.getIsResizing() && 'after:bg-focus-ring',
                    )}
                    onDoubleClick={() => header.column.resetSize()}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft') {
                        event.preventDefault();
                        resizeBy(-DATA_TABLE_KEYBOARD_RESIZE_STEP);
                      }
                      if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        resizeBy(DATA_TABLE_KEYBOARD_RESIZE_STEP);
                      }
                      if (event.key === 'Home') {
                        event.preventDefault();
                        resizeBy(minimum - header.column.getSize());
                      }
                      if (event.key === 'End') {
                        event.preventDefault();
                        resizeBy(maximum - header.column.getSize());
                      }
                    }}
                  />
                ) : null}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}
