export interface PickerActionLabels {
    cancel: string;
    done: string;
    now?: string;
}
export interface PickerActionsProps {
    labels: PickerActionLabels;
    onCancel: () => void;
    onDone: () => void;
    onNow?: () => void;
}
export declare function PickerActions({ labels, onCancel, onDone, onNow }: PickerActionsProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=PickerActions.d.ts.map