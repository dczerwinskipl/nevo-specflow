import type { RowData } from '@tanstack/react-table';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { DataTableColumn, DataTableDensity, DataTableMessages } from './DataTable.types';
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
    onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => void;
}
export declare function DataTableBody<TData extends RowData>({ table, columns, density, loading, loadingRowCount, errorState, emptyState, getRowActionLabel, messages, onRowClick, }: DataTableBodyProps<TData>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DataTableBody.d.ts.map