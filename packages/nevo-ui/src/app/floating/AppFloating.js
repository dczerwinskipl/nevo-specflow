import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState, } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib';
const AppFloatingContext = createContext(null);
function useAppFloatingContext(part) {
    const context = useContext(AppFloatingContext);
    if (!context) {
        throw new Error(`${part} must be rendered inside AppFloatingProvider.`);
    }
    return context;
}
export function AppFloatingProvider({ children, supported }) {
    const [container, setContainer] = useState(null);
    const value = useMemo(() => ({ container, setContainer, supported }), [container, supported]);
    return _jsx(AppFloatingContext.Provider, { value: value, children: children });
}
export function AppFloatingOutlet({ className, ...props }) {
    const { setContainer, supported } = useAppFloatingContext('AppFloatingOutlet');
    if (!supported)
        return null;
    return (_jsx("div", { ref: setContainer, className: cn('pointer-events-none absolute inset-0 z-40 overflow-hidden', className), "data-app-shell-region": "floating", ...props }));
}
export function AppFloatingRegion({ children }) {
    const { container, supported } = useAppFloatingContext('AppFloatingRegion');
    if (!supported || !container)
        return null;
    return createPortal(children, container);
}
//# sourceMappingURL=AppFloating.js.map