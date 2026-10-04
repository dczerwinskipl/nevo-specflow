import { createContext, useContext, type PropsWithChildren } from 'react';
import type {
  CaptureComponent,
  CaptureMetadata,
  CaptureProperties,
  CaptureSlot,
  DesignMetadataCapabilities,
  SlotComponent,
} from '@nevo/figma-core/metadata';

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

/** Enables opt-in DOM metadata for design inspection and capture tooling. */
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
export function designSlot<Component extends SlotComponent, Slot extends CaptureSlot<Component>>(
  component: Component,
  slot: Slot,
) {
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
