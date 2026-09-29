import { tv } from 'tailwind-variants/lite';
export const DATA_TABLE_DEFAULT_MIN_COLUMN_WIDTH = 64;
export const DATA_TABLE_DEFAULT_MAX_COLUMN_WIDTH = 720;
export const DATA_TABLE_SELECTION_COLUMN_WIDTH = 44;
export const DATA_TABLE_KEYBOARD_RESIZE_STEP = 8;
export const dataTableHeaderCellVariants = tv({
    base: 'relative align-middle whitespace-nowrap font-sans text-label-sm text-content-muted',
    variants: {
        density: {
            compact: 'px-3 py-2',
            default: 'px-3 py-2.5',
        },
    },
    defaultVariants: {
        density: 'default',
    },
});
export const dataTableBodyCellVariants = tv({
    base: 'align-middle',
    variants: {
        density: {
            compact: 'px-3 py-1.5',
            default: 'px-3 py-2.5',
        },
    },
    defaultVariants: {
        density: 'default',
    },
});
//# sourceMappingURL=DataTable.styles.js.map