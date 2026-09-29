import type { RowData } from '@tanstack/react-table';
import type { DataTableColumn, DataTableDensity, DataTableMessages } from './DataTable.types';
import type { DataTableInstance } from './useDataTable';
interface DataTableHeaderProps<TData extends RowData> {
    table: DataTableInstance<TData>;
    columns: ReadonlyMap<string, DataTableColumn<TData>>;
    density: DataTableDensity;
    messages: Readonly<DataTableMessages>;
}
export declare function DataTableHeader<TData extends RowData>({ table, columns, density, messages, }: DataTableHeaderProps<TData>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DataTableHeader.d.ts.map