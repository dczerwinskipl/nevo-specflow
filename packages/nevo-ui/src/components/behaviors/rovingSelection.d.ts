import { type ReactNode } from 'react';
export declare function collectEnabledItemValues(children: ReactNode): string[];
export declare function resolveRovingTabStop(selectedValue: string, enabledValues: readonly string[]): string | null;
export declare function findEnabledItems(currentItem: HTMLButtonElement, containerSelector: string, itemSelector: string): HTMLButtonElement[];
export declare function resolveRovingIndex(key: string, currentIndex: number, itemCount: number, includeVerticalArrows?: boolean): number | null;
export declare function useControllableSelection({ controlledValue, defaultValue, onValueChange, }: {
    controlledValue?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
}): {
    selectedValue: string;
    select: (nextValue: string) => void;
};
//# sourceMappingURL=rovingSelection.d.ts.map