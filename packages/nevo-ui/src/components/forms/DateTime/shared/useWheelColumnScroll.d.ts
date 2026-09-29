import { type UIEvent } from 'react';
import type { Selection } from 'react-aria-components';
export declare function useWheelColumnScroll({ itemHeight, onSelect, options, selected, settleDelayMs, }: {
    itemHeight: number;
    onSelect: (value: number) => void;
    options: readonly number[];
    selected: number;
    settleDelayMs: number;
}): {
    listRef: import("react").RefObject<HTMLDivElement | null>;
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
    onSelectionChange: (selection: Selection) => void;
};
//# sourceMappingURL=useWheelColumnScroll.d.ts.map