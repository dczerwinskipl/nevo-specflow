import type { RowData } from '@tanstack/react-table';
import type { DataTableColumn } from './DataTable.types';
import type { DataTableInstance } from './useDataTable';
interface DataTableColumnVisibilityProps<TData extends RowData> {
    table: DataTableInstance<TData>;
    columns: ReadonlyMap<string, DataTableColumn<TData>>;
    label: string;
    visibleColumnsLabel: string;
}
export declare function DataTableColumnVisibility<TData extends RowData>({ table, columns, label, visibleColumnsLabel, }: DataTableColumnVisibilityProps<TData>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DataTableColumnVisibility.d.ts.map