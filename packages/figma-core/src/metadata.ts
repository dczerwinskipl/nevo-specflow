export interface DesignCaptureRegistry {}
export interface DesignCaptureMetadataRegistry {}
export interface DesignCaptureSlotRegistry {}

export type CaptureComponent = keyof DesignCaptureRegistry & string;
export type SlotComponent = keyof DesignCaptureSlotRegistry & string;
export type CaptureSlot<Component extends SlotComponent> = DesignCaptureSlotRegistry[Component] &
  string;
export type CaptureProperties<Component extends CaptureComponent> =
  DesignCaptureRegistry[Component];
type NoMetadata = Readonly<Record<string, never>>;
export type CaptureMetadata<Component extends CaptureComponent> =
  Component extends keyof DesignCaptureMetadataRegistry
    ? DesignCaptureMetadataRegistry[Component]
    : NoMetadata;

export interface DesignMetadataCapabilities {
  textFlow?: boolean;
  textSeparator?: string;
  textStyleRef?: string;
  assetRef?: string;
  assetRepresentation?: 'svg' | 'svg-mask';
  key?: string;
  layer?: string;
}
