import type { RowData } from '@tanstack/react-table';
import type { DataTableProps } from './DataTable.types';
import './DataTable.css';
export type * from './DataTable.types';
export declare function DataTable<TData extends RowData>({ data, columns, className, tableClassName, density, toolbar, showColumnVisibility, messages: messagesProp, valueFormatter, loading, loadingRowCount, errorState, emptyState, noResultsState, hasActiveFilters, getRowId, getRowActionLabel, onRowClick, enableRowSelection, rowSelection, defaultRowSelection, onRowSelectionChange, sorting, defaultSorting, onSortingChange, manualSorting, columnVisibility, defaultColumnVisibility, onColumnVisibilityChange, columnSizing, defaultColumnSizing, onColumnSizingChange, }: DataTableProps<TData>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DataTable.d.ts.map