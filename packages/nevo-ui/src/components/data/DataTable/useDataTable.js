import { jsx as _jsx } from "react/jsx-runtime";
import { columnResizingFeature, columnSizingFeature, columnVisibilityFeature, createSortedRowModel, createTableHook, functionalUpdate, rowSelectionFeature, rowSortingFeature, sortFns, tableFeatures, } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '../../forms/Checkbox';
import { DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH, DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH, DATA_TABLE_SELECTION_COLUMN_WIDTH, } from './DataTable.styles';
import { renderDataTableValue } from './DataTable.utils';
const dataTableFeatures = tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns,
    rowSelectionFeature,
    columnVisibilityFeature,
    columnSizingFeature,
    columnResizingFeature,
});
const { useAppTable } = createTableHook({ features: dataTableFeatures });
function useTableStateUpdater(key, controlledValue, onChange, setInternalState) {
    return useCallback((updater) => {
        if (controlledValue === undefined) {
            setInternalState((previous) => ({
                ...previous,
                [key]: functionalUpdate(updater, previous[key]),
            }));
        }
        onChange?.(updater);
    }, [controlledValue, key, onChange, setInternalState]);
}
export function useDataTable({ data, columns, getRowId, enableRowSelection, rowSelection, defaultRowSelection, onRowSelectionChange, sorting, defaultSorting, onSortingChange, manualSorting, columnVisibility, defaultColumnVisibility, onColumnVisibilityChange, columnSizing, defaultColumnSizing, onColumnSizingChange, messages, valueFormatter, }) {
    const [internalState, setInternalState] = useState(() => ({
        sorting: defaultSorting,
        rowSelection: defaultRowSelection,
        columnVisibility: defaultColumnVisibility,
        columnSizing: defaultColumnSizing,
    }));
    const resolvedState = {
        sorting: sorting ?? internalState.sorting,
        rowSelection: rowSelection ?? internalState.rowSelection,
        columnVisibility: columnVisibility ?? internalState.columnVisibility,
        columnSizing: columnSizing ?? internalState.columnSizing,
    };
    const updateSorting = useTableStateUpdater('sorting', sorting, onSortingChange, setInternalState);
    const updateRowSelection = useTableStateUpdater('rowSelection', rowSelection, onRowSelectionChange, setInternalState);
    const updateColumnVisibility = useTableStateUpdater('columnVisibility', columnVisibility, onColumnVisibilityChange, setInternalState);
    const updateColumnSizing = useTableStateUpdater('columnSizing', columnSizing, onColumnSizingChange, setInternalState);
    const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
    const tanstackColumns = useMemo(() => {
        const result = columns.map((column) => {
            const accessorFn = typeof column.accessor === 'function'
                ? column.accessor
                : column.accessor
                    ? (row) => row[column.accessor]
                    : undefined;
            return {
                id: column.id,
                accessorFn,
                header: () => column.header,
                cell: (info) => {
                    const context = {
                        row: info.row.original,
                        rowIndex: info.row.index,
                        value: info.getValue(),
                    };
                    return column.cell
                        ? column.cell(context)
                        : renderDataTableValue(context, messages, valueFormatter);
                },
                enableSorting: column.sortable ?? Boolean(accessorFn),
                enableHiding: column.hideable ?? true,
                enableResizing: column.resizable ?? true,
                size: column.width,
                minSize: column.minWidth ?? DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH,
                maxSize: column.maxWidth ?? DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH,
            };
        });
        if (enableRowSelection) {
            result.unshift({
                id: '__selection',
                header: ({ table }) => (_jsx(Checkbox, { "aria-label": messages.selectAllRows, checked: table.getIsAllRowsSelected(), indeterminate: table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected(), onCheckedChange: (checked) => table.toggleAllRowsSelected(checked === true) })),
                cell: ({ row }) => (_jsx(Checkbox, { "aria-label": messages.selectRow(row.index + 1), checked: row.getIsSelected(), disabled: !row.getCanSelect(), onCheckedChange: (checked) => row.toggleSelected(checked === true) })),
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
                size: DATA_TABLE_SELECTION_COLUMN_WIDTH,
                minSize: DATA_TABLE_SELECTION_COLUMN_WIDTH,
                maxSize: DATA_TABLE_SELECTION_COLUMN_WIDTH,
            });
        }
        return result;
    }, [columns, enableRowSelection, messages, valueFormatter]);
    const table = useAppTable({
        columns: tanstackColumns,
        data,
        getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
        enableRowSelection: typeof enableRowSelection === 'function'
            ? (row) => enableRowSelection(row.original)
            : enableRowSelection,
        enableRowRangeSelection: true,
        manualSorting,
        columnResizeMode: 'onEnd',
        state: resolvedState,
        onSortingChange: updateSorting,
        onRowSelectionChange: updateRowSelection,
        onColumnVisibilityChange: updateColumnVisibility,
        onColumnSizingChange: updateColumnSizing,
    });
    return { table, columnById };
}
//# sourceMappingURL=useDataTable.js.map