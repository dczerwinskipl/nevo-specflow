import type { ColumnSizingState, ColumnVisibilityState, RowData, RowSelectionState, SortingState, OnChangeFn } from '@tanstack/react-table';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
export type DataTableDensity = 'compact' | 'default';
export type DataTableAlign = 'start' | 'center' | 'end';
export type DataTableSortingState = SortingState;
export type DataTableRowSelectionState = RowSelectionState;
export type DataTableColumnVisibilityState = ColumnVisibilityState;
export type DataTableColumnSizingState = ColumnSizingState;
export interface DataTableCellContext<TData extends RowData> {
    row: TData;
    rowIndex: number;
    value: unknown;
}
export interface DataTableMessages {
    booleanTrue: string;
    booleanFalse: string;
    columns: string;
    visibleColumns: string;
    selectAllRows: string;
    selectRow: (rowNumber: number) => string;
    activateRow: (rowNumber: number) => string;
    resizeColumn: (label: string) => string;
    sortBy: (label: string) => string;
    emptyTitle: string;
    emptyDescription: string;
    noResultsTitle: string;
    noResultsDescription: string;
}
export type DataTableValueFormatter<TData extends RowData> = (context: DataTableCellContext<TData>, messages: Readonly<DataTableMessages>) => ReactNode;
export interface DataTableColumn<TData extends RowData> {
    id: string;
    header: ReactNode;
    /** Plain text used by aria labels and the column visibility menu. */
    label?: string;
    accessor?: keyof TData | ((row: TData) => unknown);
    cell?: (context: DataTableCellContext<TData>) => ReactNode;
    align?: DataTableAlign;
    sortable?: boolean;
    hideable?: boolean;
    resizable?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}
export interface DataTableProps<TData extends RowData> {
    data: TData[];
    columns: readonly DataTableColumn<TData>[];
    className?: string;
    tableClassName?: string;
    density?: DataTableDensity;
    toolbar?: ReactNode;
    showColumnVisibility?: boolean;
    messages?: Partial<DataTableMessages>;
    /** Fallback formatter for columns without an explicit `cell` renderer. */
    valueFormatter?: DataTableValueFormatter<TData>;
    loading?: boolean;
    loadingRowCount?: number;
    errorState?: ReactNode;
    /** Custom content shown when there is no data. `null` intentionally renders nothing. */
    emptyState?: ReactNode;
    /** Custom content shown when filters produce no rows. `null` intentionally renders nothing. */
    noResultsState?: ReactNode;
    hasActiveFilters?: boolean;
    getRowId?: (row: TData, index: number) => string;
    onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => void;
    getRowActionLabel?: (row: TData, rowIndex: number) => string;
    enableRowSelection?: boolean | ((row: TData) => boolean);
    rowSelection?: DataTableRowSelectionState;
    defaultRowSelection?: DataTableRowSelectionState;
    onRowSelectionChange?: OnChangeFn<DataTableRowSelectionState>;
    sorting?: DataTableSortingState;
    defaultSorting?: DataTableSortingState;
    onSortingChange?: OnChangeFn<DataTableSortingState>;
    /** When true, sorting state changes but rows are assumed to arrive already sorted. */
    manualSorting?: boolean;
    columnVisibility?: DataTableColumnVisibilityState;
    defaultColumnVisibility?: DataTableColumnVisibilityState;
    onColumnVisibilityChange?: OnChangeFn<DataTableColumnVisibilityState>;
    columnSizing?: DataTableColumnSizingState;
    defaultColumnSizing?: DataTableColumnSizingState;
    onColumnSizingChange?: OnChangeFn<DataTableColumnSizingState>;
}
//# sourceMappingURL=DataTable.types.d.ts.map