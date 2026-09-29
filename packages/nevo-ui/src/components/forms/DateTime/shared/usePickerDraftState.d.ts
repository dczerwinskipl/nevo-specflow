export interface PickerDraftStateOptions<T> {
    defaultOpen?: boolean;
    defaultValue?: T | null;
    fallbackValue: T;
    onChange?: (value: T | null) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    value?: T | null;
}
export declare function usePickerDraftState<T>({ defaultOpen, defaultValue, fallbackValue, onChange, onOpenChange, open, value, }: PickerDraftStateOptions<T>): {
    cancel: () => void;
    commitValue: (nextValue: T | null) => void;
    committedValue: T | null;
    done: () => void;
    draftValue: T | null;
    resolvedOpen: boolean;
    setDraftValue: import("react").Dispatch<import("react").SetStateAction<T | null>>;
    setOpen: (nextOpen: boolean) => void;
};
//# sourceMappingURL=usePickerDraftState.d.ts.map