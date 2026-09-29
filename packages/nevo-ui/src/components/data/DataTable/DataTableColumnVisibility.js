import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '../../actions/Button';
import { Checkbox } from '../../forms/Checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../../overlays/Popover';
export function DataTableColumnVisibility({ table, columns, label, visibleColumnsLabel, }) {
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { size: "sm", variant: "secondary", children: label }) }), _jsx(PopoverContent, { align: "end", className: "w-64 p-2", children: _jsx("div", { className: "grid gap-1", "aria-label": visibleColumnsLabel, children: table
                        .getAllLeafColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => {
                        const definition = columns.get(column.id);
                        return (_jsxs("label", { className: "flex min-h-8 cursor-pointer items-center gap-2 rounded-control px-2 text-body-sm text-content-primary hover:bg-surface-hover", children: [_jsx(Checkbox, { checked: column.getIsVisible(), onCheckedChange: (checked) => column.toggleVisibility(checked === true) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: definition?.label ??
                                        (typeof definition?.header === 'string' ? definition.header : column.id) })] }, column.id));
                    }) }) })] }));
}
//# sourceMappingURL=DataTableColumnVisibility.js.map