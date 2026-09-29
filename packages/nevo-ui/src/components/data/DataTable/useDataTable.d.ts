import { type ColumnSizingState, type ColumnVisibilityState, type OnChangeFn, type RowData, type RowSelectionState, type SortingState } from '@tanstack/react-table';
import type { DataTableColumn, DataTableMessages, DataTableValueFormatter } from './DataTable.types';
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
export declare function useDataTable<TData extends RowData>({ data, columns, getRowId, enableRowSelection, rowSelection, defaultRowSelection, onRowSelectionChange, sorting, defaultSorting, onSortingChange, manualSorting, columnVisibility, defaultColumnVisibility, onColumnVisibilityChange, columnSizing, defaultColumnSizing, onColumnSizingChange, messages, valueFormatter, }: UseDataTableOptions<TData>): {
    table: import("@tanstack/react-table").AppReactTable<{
        rowSortingFeature: import("@tanstack/react-table").TableFeature;
        sortedRowModel: (table: import("@tanstack/react-table").Table<any, any>) => () => import("@tanstack/react-table").RowModel<any, any>;
        sortFns: {
            alphanumeric: import("@tanstack/react-table").CreatedSortFn<any, any>;
            alphanumericCaseSensitive: import("@tanstack/react-table").CreatedSortFn<any, any>;
            basic: import("@tanstack/react-table").CreatedSortFn<any, any>;
            datetime: import("@tanstack/react-table").CreatedSortFn<any, any>;
            text: import("@tanstack/react-table").CreatedSortFn<any, any>;
            textCaseSensitive: import("@tanstack/react-table").CreatedSortFn<any, any>;
        };
        rowSelectionFeature: import("@tanstack/react-table").TableFeature;
        columnVisibilityFeature: import("@tanstack/react-table").TableFeature;
        columnSizingFeature: import("@tanstack/react-table").TableFeature;
        columnResizingFeature: import("@tanstack/react-table").TableFeature;
    }, TData, import("@tanstack/react-table").TableState_ColumnResizing & import("@tanstack/react-table").TableState_ColumnSizing & import("@tanstack/react-table").TableState_ColumnVisibility & import("@tanstack/react-table").TableState_RowSelection & import("@tanstack/react-table").TableState_RowSorting, Record<string, import("react").ComponentType<any>>, Record<string, import("react").ComponentType<any>>, Record<string, import("react").ComponentType<any>>>;
    columnById: Map<string, DataTableColumn<TData>>;
};
export type DataTableInstance<TData extends RowData> = ReturnType<typeof useDataTable<TData>>['table'];
//# sourceMappingURL=useDataTable.d.ts.map