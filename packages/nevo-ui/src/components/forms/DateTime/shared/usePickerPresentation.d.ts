export type PickerPresentation = 'auto' | 'desktop' | 'mobile';
type ResolvedPickerPresentation = Exclude<PickerPresentation, 'auto'>;
export declare function usePickerPresentation(requestedPresentation?: PickerPresentation): ResolvedPickerPresentation;
export {};
//# sourceMappingURL=usePickerPresentation.d.ts.map