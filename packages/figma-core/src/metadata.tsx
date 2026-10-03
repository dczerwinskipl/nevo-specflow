import { createContext, useContext, type PropsWithChildren } from 'react';

export interface DesignCaptureRegistry {}
export interface DesignCaptureMetadataRegistry {}
export interface DesignCaptureSlotRegistry {}

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
type CaptureMetadata<Component extends CaptureComponent> =
  Component extends keyof DesignCaptureMetadataRegistry
    ? DesignCaptureMetadataRegistry[Component]
    : NoMetadata;

interface DesignMetadataContextValue {
  enabled: boolean;
  captureComponents: ReadonlySet<string>;
  excludedComponents: ReadonlySet<string>;
}

const DesignMetadataContext = createContext<DesignMetadataContextValue>({
  enabled: false,
  captureComponents: new Set(),
  excludedComponents: new Set(),
});

/** Enables neutral DOM metadata for optional design inspection/capture tooling. */
export function DesignMetadataProvider({
  children,
  captureComponents = [],
}: PropsWithChildren<{ captureComponents?: readonly CaptureComponent[] }>) {
  return (
    <DesignMetadataContext.Provider
      value={{
        enabled: true,
        captureComponents: new Set(captureComponents),
        excludedComponents: new Set(),
      }}
    >
      {children}
    </DesignMetadataContext.Provider>
  );
}

export { DesignMetadataProvider as DesignCaptureProvider };

/** Tooling boundary for transparent composition hosts inside a captured component. */
export function DesignMetadataBoundary({
  children,
  excludeComponents,
}: PropsWithChildren<{ excludeComponents: readonly CaptureComponent[] }>) {
  const parent = useContext(DesignMetadataContext);
  return (
    <DesignMetadataContext.Provider
      value={{
        ...parent,
        excludedComponents: new Set([...parent.excludedComponents, ...excludeComponents]),
      }}
    >
      {children}
    </DesignMetadataContext.Provider>
  );
}

function metadataAttribute(name: string) {
  return `data-design-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function serializeMetadata(metadata: DesignMetadataCapabilities) {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([name, value]) =>
      value === undefined ? [] : [[metadataAttribute(name), String(value)]],
    ),
  );
}

/** Typed metadata for nested layers used by opt-in inspection tooling. */
export function designLayerMetadata(
  metadata: Pick<DesignMetadataCapabilities, 'key' | 'layer' | 'textFlow' | 'textSeparator'>,
) {
  return serializeMetadata(metadata);
}

/**
 * Stable public anatomy marker. Slots are intentionally part of runtime markup so
 * inspection tools can understand component composition without a Figma dependency.
 */
export function designSlot<
  Component extends SlotComponent,
  Slot extends DesignCaptureSlotRegistry[Component] & string,
>(component: Component, slot: Slot) {
  void component;
  return { 'data-design-slot': slot } as const;
}

/** Normal application renders remain free of capture-instance metadata. */
export function useDesignMetadata<Component extends CaptureComponent>(
  component: Component,
  properties?: CaptureProperties<Component>,
  metadata?: CaptureMetadata<Component>,
) {
  const { enabled, captureComponents, excludedComponents } = useContext(DesignMetadataContext);
  if (!enabled || excludedComponents.has(component)) return {};
  return {
    'data-design-component': component,
    ...(captureComponents.has(component) ? { 'data-design-capture': 'true' } : {}),
    ...Object.fromEntries(
      Object.entries(properties ?? {}).map(([name, value]) => [
        `data-design-prop-${name}`,
        String(value),
      ]),
    ),
    ...serializeMetadata(metadata ?? {}),
  };
}
