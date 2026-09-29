import {
  createContext,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib';

interface AppFloatingContextValue {
  container: HTMLElement | null;
  setContainer: (container: HTMLElement | null) => void;
  supported: boolean;
}

const AppFloatingContext = createContext<AppFloatingContextValue | null>(null);

function useAppFloatingContext(part: string) {
  const context = useContext(AppFloatingContext);
  if (!context) {
    throw new Error(`${part} must be rendered inside AppFloatingProvider.`);
  }
  return context;
}

export interface AppFloatingProviderProps {
  children: ReactNode;
  supported: boolean;
}

export function AppFloatingProvider({ children, supported }: AppFloatingProviderProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ container, setContainer, supported }), [container, supported]);

  return <AppFloatingContext.Provider value={value}>{children}</AppFloatingContext.Provider>;
}

export type AppFloatingOutletProps = HTMLAttributes<HTMLDivElement>;

export function AppFloatingOutlet({ className, ...props }: AppFloatingOutletProps) {
  const { setContainer, supported } = useAppFloatingContext('AppFloatingOutlet');

  if (!supported) return null;

  return (
    <div
      ref={setContainer}
      className={cn('pointer-events-none absolute inset-0 z-40 overflow-hidden', className)}
      data-app-shell-region="floating"
      {...props}
    />
  );
}

export interface AppFloatingRegionProps {
  children: ReactNode;
}

export function AppFloatingRegion({ children }: AppFloatingRegionProps) {
  const { container, supported } = useAppFloatingContext('AppFloatingRegion');

  if (!supported || !container) return null;
  return createPortal(children, container);
}

