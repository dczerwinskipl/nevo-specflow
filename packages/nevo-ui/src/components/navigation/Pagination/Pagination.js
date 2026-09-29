import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Button } from '../../actions/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../forms/Select';
import { paginationPageItems } from './Pagination.model';
export const defaultPaginationLabels = {
    navigation: 'Pagination',
    rows: 'Rows',
    rowsPerPage: 'Rows per page',
    previous: 'Previous',
    next: 'Next',
    page: (pageNumber) => `Page ${pageNumber}`,
    knownSummary: (start, end, total) => `${start}–${end} of ${total}`,
    unknownSummary: (pageNumber) => `Page ${pageNumber}`,
    cursorSummary: 'More results may be available',
};
function PageSizeControl({ pageSize, options, onChange, labels, }) {
    if (!options?.length || !onChange)
        return null;
    return (_jsxs("div", { className: "flex items-center gap-2 text-body-sm text-content-muted", children: [_jsx("span", { children: labels.rows }), _jsxs(Select, { value: String(pageSize), onValueChange: (value) => onChange(Number(value)), children: [_jsx(SelectTrigger, { "aria-label": labels.rowsPerPage, className: "w-20", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: options.map((value) => (_jsx(SelectItem, { value: String(value), children: value }, value))) })] })] }));
}
function NavigationButtons({ hasPrevious, hasNext, onPrevious, onNext, labels, }) {
    return (_jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { size: "sm", variant: "secondary", disabled: !hasPrevious, onClick: onPrevious, children: labels.previous }), _jsx(Button, { size: "sm", variant: "secondary", disabled: !hasNext, onClick: onNext, children: labels.next })] }));
}
export function Pagination(props) {
    const labels = { ...defaultPaginationLabels, ...props.labels };
    const presentation = props.mode === 'known'
        ? (props.variant ?? 'pages') === 'pages'
            ? 'known-pages'
            : 'known-simple'
        : props.mode === 'unknown'
            ? 'unknown-simple'
            : 'cursor-simple';
    const capture = useDesignMetadata('Pagination', { presentation });
    if (props.mode === 'cursor') {
        return (_jsx("nav", { "aria-label": labels.navigation, className: cn('min-w-0', props.className), ...capture, children: _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", ...designSlot('Pagination', 'content'), children: [_jsx("div", { className: "text-body-sm text-content-muted", children: props.summary ?? labels.cursorSummary }), _jsx(NavigationButtons, { hasPrevious: props.hasPreviousPage, hasNext: props.hasNextPage, onPrevious: props.onPrevious, onNext: props.onNext, labels: labels })] }) }));
    }
    const hasPrevious = props.mode === 'known' ? props.pageIndex > 0 : (props.hasPreviousPage ?? props.pageIndex > 0);
    const pageCount = props.mode === 'known' ? Math.max(1, Math.ceil(props.totalCount / props.pageSize)) : undefined;
    const hasNext = props.mode === 'known' ? props.pageIndex + 1 < (pageCount ?? 1) : props.hasNextPage;
    const start = props.pageIndex * props.pageSize + 1;
    const end = props.mode === 'known'
        ? Math.min(props.totalCount, start + props.pageSize - 1)
        : start + props.pageSize - 1;
    const summary = props.mode === 'known'
        ? labels.knownSummary(props.totalCount === 0 ? 0 : start, props.totalCount === 0 ? 0 : end, props.totalCount)
        : (props.summary ?? labels.unknownSummary(props.pageIndex + 1));
    const previous = () => props.onPageChange(Math.max(0, props.pageIndex - 1));
    const next = () => props.onPageChange(props.pageIndex + 1);
    if (props.mode === 'known' && (props.variant ?? 'pages') === 'pages') {
        const items = paginationPageItems(props.pageIndex, pageCount ?? 1, props.siblingCount ?? 1);
        let ellipsisIndex = 0;
        return (_jsx("nav", { "aria-label": labels.navigation, className: cn('min-w-0', props.className), ...capture, children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", ...designSlot('Pagination', 'content'), children: [_jsx(PageSizeControl, { pageSize: props.pageSize, options: props.pageSizeOptions, onChange: props.onPageSizeChange, labels: labels }), _jsx("div", { className: "ml-auto text-body-sm text-content-muted", children: summary }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Button, { size: "sm", variant: "secondary", disabled: !hasPrevious, onClick: previous, children: labels.previous }), items.map((item) => {
                                if (item === 'ellipsis') {
                                    ellipsisIndex += 1;
                                    return (_jsx("span", { "aria-hidden": true, className: "inline-flex h-control-height-compact min-w-6 items-center justify-center px-1 text-body-sm text-content-muted", children: "\u2026" }, `ellipsis-${ellipsisIndex}`));
                                }
                                const selected = item === props.pageIndex;
                                return (_jsx(Button, { size: "sm", variant: "secondary", "aria-current": selected ? 'page' : undefined, "aria-label": labels.page(item + 1), className: cn('min-w-control-height-compact px-2', selected && 'border-border-strong bg-surface-selected text-content-primary'), onClick: () => props.onPageChange(item), children: item + 1 }, item));
                            }), _jsx(Button, { size: "sm", variant: "secondary", disabled: !hasNext, onClick: next, children: labels.next })] })] }) }));
    }
    return (_jsx("nav", { "aria-label": labels.navigation, className: cn('min-w-0', props.className), ...capture, children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", ...designSlot('Pagination', 'content'), children: [_jsx(PageSizeControl, { pageSize: props.pageSize, options: props.pageSizeOptions, onChange: props.onPageSizeChange, labels: labels }), _jsx("div", { className: "ml-auto text-body-sm text-content-muted", children: summary }), _jsx(NavigationButtons, { hasPrevious: hasPrevious, hasNext: hasNext, onPrevious: previous, onNext: next, labels: labels })] }) }));
}
//# sourceMappingURL=Pagination.js.map