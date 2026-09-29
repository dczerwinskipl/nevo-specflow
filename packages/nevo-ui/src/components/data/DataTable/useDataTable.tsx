import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  createTableHook,
  functionalUpdate,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type ColumnDef,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Checkbox } from '../../forms/Checkbox';
import {
  DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH,
  DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH,
  DATA_TABLE_SELECTION_COLUMN_WIDTH,
} from './DataTable.styles';
import type {
  DataTableColumn,
  DataTableMessages,
  DataTableValueFormatter,
} from './DataTable.types';
import { renderDataTableValue } from './DataTable.utils';

const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
});

const { useAppTable } = createTableHook({ features: dataTableFeatures });

type DataTableFeatures = typeof dataTableFeatures;
type InternalColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData, unknown>;

interface InternalTableState {
  sorting: SortingState;
  rowSelection: RowSelectionState;
  columnVisibility: ColumnVisibilityState;
  columnSizing: ColumnSizingState;
}

function useTableStateUpdater<Key extends keyof InternalTableState>(
  key: Key,
  controlledValue: InternalTableState[Key] | undefined,
  onChange: OnChangeFn<InternalTableState[Key]> | undefined,
  setInternalState: Dispatch<SetStateAction<InternalTableState>>,
) {
  return useCallback<OnChangeFn<InternalTableState[Key]>>(
    (updater) => {
      if (controlledValue === undefined) {
        setInternalState((previous) => ({
          ...previous,
          [key]: functionalUpdate(updater, previous[key]),
        }));
      }
      onChange?.(updater);
    },
    [controlledValue, key, onChange, setInternalState],
  );
}

export interface UseDataTableOptions<TData extends RowData> {
  data: TData[];
  columns: readonly DataTableColumn<TData>[];
  getRowId?: (row: TData, index: number) => string;
  enableRowSelection: boolean | ((row: TData) => boolean);
  rowSelection?: RowSelectionState;
  defaultRowSelection: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  sorting?: SortingState;
  defaultSorting: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting: boolean;
  columnVisibility?: ColumnVisibilityState;
  defaultColumnVisibility: ColumnVisibilityState;
  onColumnVisibilityChange?: OnChangeFn<ColumnVisibilityState>;
  columnSizing?: ColumnSizingState;
  defaultColumnSizing: ColumnSizingState;
  onColumnSizingChange?: OnChangeFn<ColumnSizingState>;
  messages: Readonly<DataTableMessages>;
  valueFormatter?: DataTableValueFormatter<TData>;
}

export function useDataTable<TData extends RowData>({
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
}: UseDataTableOptions<TData>) {
  const [internalState, setInternalState] = useState<InternalTableState>(() => ({
    sorting: defaultSorting,
    rowSelection: defaultRowSelection,
    columnVisibility: defaultColumnVisibility,
    columnSizing: defaultColumnSizing,
  }));

  const resolvedState = {
    sorting: sorting ?? internalState.sorting,
    rowSelection: rowSelection ?? internalState.rowSelection,
    columnVisibility: columnVisibility ?? internalState.columnVisibility,
    columnSizing: columnSizing ?? internalState.columnSizing,
  };

  const updateSorting = useTableStateUpdater('sorting', sorting, onSortingChange, setInternalState);
  const updateRowSelection = useTableStateUpdater(
    'rowSelection',
    rowSelection,
    onRowSelectionChange,
    setInternalState,
  );
  const updateColumnVisibility = useTableStateUpdater(
    'columnVisibility',
    columnVisibility,
    onColumnVisibilityChange,
    setInternalState,
  );
  const updateColumnSizing = useTableStateUpdater(
    'columnSizing',
    columnSizing,
    onColumnSizingChange,
    setInternalState,
  );

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column] as const)),
    [columns],
  );

  const tanstackColumns = useMemo<InternalColumnDef<TData>[]>(() => {
    const result = columns.map<InternalColumnDef<TData>>((column) => {
      const accessorFn =
        typeof column.accessor === 'function'
          ? column.accessor
          : column.accessor
            ? (row: TData) => row[column.accessor as keyof TData]
            : undefined;

      return {
        id: column.id,
        accessorFn,
        header: () => column.header,
        cell: (info) => {
          const context = {
            row: info.row.original,
            rowIndex: info.row.index,
            value: info.getValue(),
          };
          return column.cell
            ? column.cell(context)
            : renderDataTableValue(context, messages, valueFormatter);
        },
        enableSorting: column.sortable ?? Boolean(accessorFn),
        enableHiding: column.hideable ?? true,
        enableResizing: column.resizable ?? true,
        size: column.width,
        minSize: column.minWidth ?? DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH,
        maxSize: column.maxWidth ?? DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH,
      };
    });

    if (enableRowSelection) {
      result.unshift({
        id: '__selection',
        header: ({ table }) => (
          <Checkbox
            aria-label={messages.selectAllRows}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={messages.selectRow(row.index + 1)}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        size: DATA_TABLE_SELECTION_COLUMN_WIDTH,
        minSize: DATA_TABLE_SELECTION_COLUMN_WIDTH,
        maxSize: DATA_TABLE_SELECTION_COLUMN_WIDTH,
      });
    }

    return result;
  }, [columns, enableRowSelection, messages, valueFormatter]);

  const table = useAppTable({
    columns: tanstackColumns,
    data,
    getRowId: getRowId ? (row: TData, index: number) => getRowId(row, index) : undefined,
    enableRowSelection:
      typeof enableRowSelection === 'function'
        ? (row) => enableRowSelection(row.original)
        : enableRowSelection,
    enableRowRangeSelection: true,
    manualSorting,
    columnResizeMode: 'onEnd',
    state: resolvedState,
    onSortingChange: updateSorting,
    onRowSelectionChange: updateRowSelection,
    onColumnVisibilityChange: updateColumnVisibility,
    onColumnSizingChange: updateColumnSizing,
  });

  return { table, columnById };
}

export type DataTableInstance<TData extends RowData> = ReturnType<
  typeof useDataTable<TData>
>['table'];
