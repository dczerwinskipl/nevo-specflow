interface ComparablePickerValue<T> {
    compare(other: T): number;
}
export declare function clampPickerValue<T extends ComparablePickerValue<T>>(value: T, minValue?: T | null, maxValue?: T | null): T;
export {};
//# sourceMappingURL=clampPickerValue.d.ts.map