import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH, DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH, DATA_TABLE_KEYBOARD_RESIZE_STEP, dataTableHeaderCellVariants, } from './DataTable.styles';
import { dataTableAlignClassName } from './DataTable.utils';
export function DataTableHeader({ table, columns, density, messages, }) {
    return (_jsx("thead", { className: "sticky top-0 z-10 bg-surface-subtle", children: table.getHeaderGroups().map((headerGroup) => (_jsx("tr", { className: "border-b border-divider", children: headerGroup.headers.map((header) => {
                const definition = columns.get(header.column.id);
                const alignment = definition?.align ?? 'start';
                const sorted = header.column.getIsSorted();
                const label = definition?.label ??
                    (typeof definition?.header === 'string' ? definition.header : header.column.id);
                const minimum = header.column.columnDef.minSize ?? DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH;
                const maximum = header.column.columnDef.maxSize ?? DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH;
                const resizeBy = (delta) => {
                    table.setColumnSizing((previous) => {
                        const current = previous[header.column.id] ?? header.column.getSize();
                        return {
                            ...previous,
                            [header.column.id]: Math.min(maximum, Math.max(minimum, current + delta)),
                        };
                    });
                };
                return (_jsxs("th", { colSpan: header.colSpan, "aria-sort": sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined, className: cn(dataTableHeaderCellVariants({ density }), dataTableAlignClassName(alignment)), style: { width: header.getSize() }, children: [header.isPlaceholder ? null : header.column.getCanSort() ? (_jsxs("button", { type: "button", className: cn('inline-flex max-w-full items-center gap-1 rounded-control-inline text-inherit outline-none hover:text-content-primary', alignment === 'end' && 'ml-auto', alignment === 'center' && 'mx-auto'), onClick: header.column.getToggleSortingHandler(), "aria-label": messages.sortBy(label), children: [_jsx("span", { className: "min-w-0 truncate", children: _jsx(table.FlexRender, { header: header }) }), sorted ? (_jsx(Icon, { name: "chevron-down", size: "sm", className: cn('text-content-muted', sorted === 'asc' && 'rotate-180') })) : null] })) : (_jsxs(_Fragment, { children: [_jsx(table.FlexRender, { header: header }), typeof definition?.header === 'string' && definition.header.trim() === '' ? (_jsx("span", { className: "sr-only", children: label })) : null] })), header.column.getCanResize() ? (_jsx("div", { role: "separator", "aria-label": messages.resizeColumn(label), "aria-orientation": "vertical", "aria-valuemin": minimum, "aria-valuemax": maximum, "aria-valuenow": Math.round(header.column.getSize()), tabIndex: 0, className: cn('absolute inset-y-0 right-0 w-3 cursor-col-resize touch-none outline-none', 'after:absolute after:inset-y-1.5 after:right-0 after:w-px after:bg-transparent hover:after:bg-border-strong focus-visible:after:bg-focus-ring', header.column.getIsResizing() && 'after:bg-focus-ring'), onDoubleClick: () => header.column.resetSize(), onMouseDown: header.getResizeHandler(), onTouchStart: header.getResizeHandler(), onKeyDown: (event) => {
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
                            } })) : null] }, header.id));
            }) }, headerGroup.id))) }));
}
//# sourceMappingURL=DataTableHeader.js.map