import { jsx as _jsx } from "react/jsx-runtime";
import { EmptyState } from '../../feedback/EmptyState';
export const defaultDataTableMessages = {
    booleanTrue: 'Yes',
    booleanFalse: 'No',
    columns: 'Columns',
    visibleColumns: 'Visible columns',
    selectAllRows: 'Select all rows',
    selectRow: (rowNumber) => `Select row ${rowNumber}`,
    activateRow: (rowNumber) => `Activate row ${rowNumber}`,
    resizeColumn: (label) => `Resize ${label} column`,
    sortBy: (label) => `Sort by ${label}`,
    emptyTitle: 'No data',
    emptyDescription: 'There are no records to display.',
    noResultsTitle: 'No matching results',
    noResultsDescription: 'Try changing or clearing the current filters.',
};
export function dataTableAlignClassName(align = 'start') {
    if (align === 'center')
        return 'text-center';
    if (align === 'end')
        return 'text-right';
    return 'text-left';
}
export function renderDataTableValue(context, messages, formatter) {
    if (formatter)
        return formatter(context, messages);
    const { value } = context;
    if (value === null || value === undefined || value === '') {
        return _jsx("span", { className: "text-content-muted", children: "\u2014" });
    }
    if (typeof value === 'boolean')
        return value ? messages.booleanTrue : messages.booleanFalse;
    return String(value);
}
export function defaultDataTableEmptyState(hasActiveFilters, messages) {
    return hasActiveFilters ? (_jsx(EmptyState, { className: "min-h-44 border-0 bg-transparent", title: messages.noResultsTitle, description: messages.noResultsDescription })) : (_jsx(EmptyState, { className: "min-h-44 border-0 bg-transparent", title: messages.emptyTitle, description: messages.emptyDescription }));
}
const interactiveTableContent = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    '[data-table-interactive="true"]',
].join(',');
export function isInteractiveTableTarget(target, row) {
    if (!(target instanceof Element))
        return false;
    const interactive = target.closest(interactiveTableContent);
    return interactive !== null && row.contains(interactive);
}
//# sourceMappingURL=DataTable.utils.js.map