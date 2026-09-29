import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '../../../lib';
import { Skeleton } from '../../feedback/Skeleton';
import { dataTableBodyCellVariants } from './DataTable.styles';
import { dataTableAlignClassName, isInteractiveTableTarget } from './DataTable.utils';
export function DataTableBody({ table, columns, density, loading, loadingRowCount, errorState, emptyState, getRowActionLabel, messages, onRowClick, }) {
    const rows = table.getRowModel().rows;
    const visibleColumnCount = Math.max(1, table.getVisibleLeafColumns().length);
    return (_jsx("tbody", { children: errorState ? (_jsx("tr", { children: _jsx("td", { colSpan: visibleColumnCount, className: "align-middle px-4 py-10 text-center text-body-sm text-content-error", children: errorState }) })) : loading ? (Array.from({ length: loadingRowCount }, (_, index) => (_jsx("tr", { className: "border-b border-divider last:border-b-0", children: table.getVisibleLeafColumns().map((column) => (_jsx("td", { className: dataTableBodyCellVariants({ density }), style: { width: column.getSize() }, children: _jsx(Skeleton, { className: "h-4 w-full max-w-48" }) }, column.id))) }, `loading-${index}`)))) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: visibleColumnCount, className: "align-middle p-0", children: emptyState }) })) : (rows.map((row) => (_jsx("tr", { "data-selected": row.getIsSelected() ? 'true' : undefined, className: cn('border-b border-divider transition-colors last:border-b-0', 'hover:bg-surface-hover data-[selected=true]:bg-surface-selected', onRowClick &&
                'cursor-pointer outline-none focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring'), "aria-label": onRowClick
                ? (getRowActionLabel?.(row.original, row.index) ??
                    messages.activateRow(row.index + 1))
                : undefined, tabIndex: onRowClick ? 0 : undefined, onClick: onRowClick
                ? (event) => {
                    if (!isInteractiveTableTarget(event.target, event.currentTarget)) {
                        onRowClick(row.original, event);
                    }
                }
                : undefined, onKeyDown: onRowClick
                ? (event) => {
                    if ((event.key === 'Enter' || event.key === ' ') &&
                        !isInteractiveTableTarget(event.target, event.currentTarget)) {
                        event.preventDefault();
                        onRowClick(row.original, event);
                    }
                }
                : undefined, children: row.getVisibleCells().map((cell) => {
                const definition = columns.get(cell.column.id);
                return (_jsx("td", { className: cn(dataTableBodyCellVariants({ density }), dataTableAlignClassName(definition?.align)), style: { width: cell.column.getSize() }, children: _jsx("div", { className: "min-w-0 overflow-hidden text-ellipsis focus-within:overflow-visible", children: _jsx(table.FlexRender, { cell: cell }) }) }, cell.id));
            }) }, row.id)))) }));
}
//# sourceMappingURL=DataTableBody.js.map