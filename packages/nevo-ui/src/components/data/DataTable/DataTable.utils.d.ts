import type { RowData } from '@tanstack/react-table';
import type { DataTableAlign, DataTableCellContext, DataTableMessages, DataTableValueFormatter } from './DataTable.types';
export declare const defaultDataTableMessages: DataTableMessages;
export declare function dataTableAlignClassName(align?: DataTableAlign): "text-center" | "text-right" | "text-left";
export declare function renderDataTableValue<TData extends RowData>(context: DataTableCellContext<TData>, messages: Readonly<DataTableMessages>, formatter?: DataTableValueFormatter<TData>): string | number | bigint | boolean | Iterable<import("react").ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<import("react").ReactNode> | null | undefined> | import("react/jsx-runtime").JSX.Element | null | undefined;
export declare function defaultDataTableEmptyState(hasActiveFilters: boolean, messages: Readonly<DataTableMessages>): import("react/jsx-runtime").JSX.Element;
export declare function isInteractiveTableTarget(target: EventTarget | null, row: HTMLTableRowElement): boolean;
//# sourceMappingURL=DataTable.utils.d.ts.map