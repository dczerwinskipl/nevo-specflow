import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from 'react';
const DesignMetadataContext = createContext({
    enabled: false,
    captureComponents: new Set(),
});
/** Enables neutral DOM metadata for optional design inspection/capture tooling. */
export function DesignMetadataProvider({ children, captureComponents = [], }) {
    return (_jsx(DesignMetadataContext.Provider, { value: { enabled: true, captureComponents: new Set(captureComponents) }, children: children }));
}
export { DesignMetadataProvider as DesignCaptureProvider };
function metadataAttribute(name) {
    return `data-design-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
function serializeMetadata(metadata) {
    return Object.fromEntries(Object.entries(metadata).flatMap(([name, value]) => value === undefined ? [] : [[metadataAttribute(name), String(value)]]));
}
/** Typed metadata for nested layers used by opt-in inspection tooling. */
export function designLayerMetadata(metadata) {
    return serializeMetadata(metadata);
}
/**
 * Stable public anatomy marker. Slots are intentionally part of runtime markup so
 * inspection tools can understand component composition without a Figma dependency.
 */
export function designSlot(component, slot) {
    void component;
    return { 'data-design-slot': slot };
}
/** Normal application renders remain free of capture-instance metadata. */
export function useDesignMetadata(component, properties, metadata) {
    const { enabled, captureComponents } = useContext(DesignMetadataContext);
    if (!enabled)
        return {};
    return {
        'data-design-component': component,
        ...(captureComponents.has(component) ? { 'data-design-capture': 'true' } : {}),
        ...Object.fromEntries(Object.entries(properties ?? {}).map(([name, value]) => [
            `data-design-prop-${name}`,
            String(value),
        ])),
        ...serializeMetadata((metadata ?? {})),
    };
}
//# sourceMappingURL=metadata.js.map