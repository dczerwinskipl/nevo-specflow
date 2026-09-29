import { type PropsWithChildren } from 'react';
export interface DesignCaptureRegistry {
}
export interface DesignCaptureMetadataRegistry {
}
export interface DesignCaptureSlotRegistry {
}
export interface DesignMetadataCapabilities {
    textFlow?: boolean;
    textSeparator?: string;
    textStyleRef?: string;
    assetRef?: string;
    assetRepresentation?: 'svg' | 'svg-mask';
    key?: string;
    layer?: string;
}
type CaptureComponent = keyof DesignCaptureRegistry & string;
type SlotComponent = keyof DesignCaptureSlotRegistry & string;
type CaptureProperties<Component extends CaptureComponent> = DesignCaptureRegistry[Component];
type NoMetadata = Readonly<Record<string, never>>;
type CaptureMetadata<Component extends CaptureComponent> = Component extends keyof DesignCaptureMetadataRegistry ? DesignCaptureMetadataRegistry[Component] : NoMetadata;
/** Enables neutral DOM metadata for optional design inspection/capture tooling. */
export declare function DesignMetadataProvider({ children, captureComponents, }: PropsWithChildren<{
    captureComponents?: readonly CaptureComponent[];
}>): import("react/jsx-runtime").JSX.Element;
export { DesignMetadataProvider as DesignCaptureProvider };
/** Typed metadata for nested layers used by opt-in inspection tooling. */
export declare function designLayerMetadata(metadata: Pick<DesignMetadataCapabilities, 'key' | 'layer' | 'textFlow' | 'textSeparator'>): {
    [k: string]: string;
};
/**
 * Stable public anatomy marker. Slots are intentionally part of runtime markup so
 * inspection tools can understand component composition without a Figma dependency.
 */
export declare function designSlot<Component extends SlotComponent, Slot extends DesignCaptureSlotRegistry[Component] & string>(component: Component, slot: Slot): {
    readonly 'data-design-slot': Slot;
};
/** Normal application renders remain free of capture-instance metadata. */
export declare function useDesignMetadata<Component extends CaptureComponent>(component: Component, properties?: CaptureProperties<Component>, metadata?: CaptureMetadata<Component>): {};
//# sourceMappingURL=metadata.d.ts.map