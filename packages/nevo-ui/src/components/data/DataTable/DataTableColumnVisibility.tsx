import type { RowData } from '@tanstack/react-table';
import { Button } from '../../actions/Button';
import { Checkbox } from '../../forms/Checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../../overlays/Popover';
import type { DataTableColumn } from './DataTable.types';
import type { DataTableInstance } from './useDataTable';

interface DataTableColumnVisibilityProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  columns: ReadonlyMap<string, DataTableColumn<TData>>;
  label: string;
  visibleColumnsLabel: string;
}

export function DataTableColumnVisibility<TData extends RowData>({
  table,
  columns,
  label,
  visibleColumnsLabel,
}: DataTableColumnVisibilityProps<TData>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="grid gap-1" aria-label={visibleColumnsLabel}>
          {table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
              const definition = columns.get(column.id);
              return (
                <label
                  key={column.id}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-control px-2 text-body-sm text-content-primary hover:bg-surface-hover"
                >
                  <Checkbox
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {definition?.label ??
                      (typeof definition?.header === 'string' ? definition.header : column.id)}
                  </span>
                </label>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

