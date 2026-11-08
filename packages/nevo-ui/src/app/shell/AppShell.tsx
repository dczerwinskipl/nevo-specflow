import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import {
  DesignMetadataBoundary,
  designSlot,
  useDesignMetadata,
} from '@nevo/figma-capture/metadata';
import { useElementWidth, observeWidthCoalesced } from '../../components/behaviors/useElementWidth';
import { AppBackground, WorkspaceSurface } from '../../components/foundations/Environment';
import { Drawer, DrawerContent, DrawerTitle } from '../../components/overlays/Drawer';
import { cn } from '../../lib';
import { AppFloatingOutlet, AppFloatingProvider } from '../floating/AppFloating';
import {
  APP_NAVIGATION_WIDTH,
  APP_SHELL_GAP,
  WIDE_SHELL_MIN_WIDTH,
  resolveWorkspaceContentWidth,
} from '../workspace/workspaceSizing';

export type AppNavigationMode = 'persistent' | 'drawer';

interface AppWorkspaceContextValue {
  /** Border-box width of the workspace region: decides split/stacked mode and thresholds. */
  availableWidth?: number;
  /** Content-box width inside the surface borders: the width slot sizes must add up to. */
  contentWidth?: number;
  navigationMode: AppNavigationMode;
  /**
   * Re-reads the workspace surface width before paint. `AppWorkspace` calls it from a layout
   * effect whenever its resolved fit changes (for example on a route change between a Focused and
   * a full-width screen), so the inset edge (`border-r`, top-right corner) is right in the first
   * paint instead of one coalesced `ResizeObserver` frame later.
   */
  syncWorkspaceWidth?: () => void;
}

const AppWorkspaceContext = createContext<AppWorkspaceContextValue>({
  navigationMode: 'drawer',
});

export function useAppWorkspace() {
  return useContext(AppWorkspaceContext);
}

interface AppNavigationContextValue {
  navigationOpen: boolean;
  closeNavigation: (focusTarget?: () => HTMLElement | null) => void;
}

const AppNavigationContext = createContext<AppNavigationContextValue>({
  navigationOpen: false,
  closeNavigation: () => undefined,
});

export function useAppNavigation() {
  return useContext(AppNavigationContext);
}

function useDescendantWidth<T extends HTMLElement>(
  root: T | null,
  selector: string,
  enabled: boolean,
) {
  const [width, setWidth] = useState<number>();
  const measureNow = useRef<(() => void) | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) {
      setWidth(undefined);

      return;
    }

    const element = root?.querySelector<HTMLElement>(selector);
    if (!element) {
      return;
    }

    const update = () => setWidth(element.getBoundingClientRect().width);

    update();
    measureNow.current = update;
    const stopObserving = observeWidthCoalesced(element, update);

    return () => {
      measureNow.current = undefined;
      stopObserving?.();
    };
  }, [enabled, root, selector]);

  // Stable identity: consumers call it from layout effects keyed on their own sizing inputs.
  const sync = useCallback(() => measureNow.current?.(), []);

  return { width, sync };
}

export interface AppShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  brandPrimary?: string;
  navigation: ReactNode;
  children: ReactNode;
  labels?: Partial<AppShellLabels>;
}

export interface AppShellLabels {
  closeNavigation: string;
  navigationTitle: string;
}

const defaultAppShellLabels: AppShellLabels = {
  closeNavigation: 'Close navigation',
  navigationTitle: 'Application navigation',
};

export function resolveAppShellLayout(width: number | undefined) {
  const wide = width !== undefined && width >= WIDE_SHELL_MIN_WIDTH;

  return {
    availableWidth:
      width === undefined
        ? undefined
        : Math.max(0, width - (wide ? APP_NAVIGATION_WIDTH + APP_SHELL_GAP : 0)),
    navigationMode: wide ? ('persistent' as const) : ('drawer' as const),
    workspaceMaterialOwner: wide ? ('shell' as const) : ('panel' as const),
    wide,
  };
}

export function AppShell({
  brandPrimary,
  navigation,
  children,
  className,
  labels: labelsProp,
  style,
  ...props
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationOpenRef = useRef(false);
  const navigationOpener = useRef<HTMLElement | null>(null);
  const navigationFocusTarget = useRef<(() => HTMLElement | null) | undefined>(undefined);
  const {
    setElement: shellRef,
    element: shellElement,
    width: shellWidth,
  } = useElementWidth<HTMLDivElement>();
  const { availableWidth, navigationMode, workspaceMaterialOwner, wide } =
    resolveAppShellLayout(shellWidth);
  const labels = { ...defaultAppShellLabels, ...labelsProp };
  const capture = useDesignMetadata('AppShell', { viewport: 'desktop' });
  const { width: workspaceWidth, sync: syncWorkspaceWidth } = useDescendantWidth(
    shellElement,
    '[data-app-shell-region="workspace"]',
    wide,
  );
  const isDesignCapture =
    'data-design-capture' in capture && capture['data-design-capture'] === 'true';
  const workspaceIsInset =
    !isDesignCapture &&
    wide &&
    availableWidth !== undefined &&
    workspaceWidth !== undefined &&
    workspaceWidth < availableWidth - 1;
  const closeNavigation = useCallback((focusTarget?: () => HTMLElement | null) => {
    if (navigationOpenRef.current) {
      navigationFocusTarget.current = focusTarget;
    }

    navigationOpenRef.current = false;
    setNavigationOpen(false);
  }, []);
  const navigationContext = useMemo(
    () => ({ closeNavigation, navigationOpen }),
    [closeNavigation, navigationOpen],
  );
  const contentWidth = resolveWorkspaceContentWidth(availableWidth, {
    bordered: workspaceMaterialOwner === 'shell',
    inset: workspaceIsInset,
  });
  const workspaceContext = useMemo<AppWorkspaceContextValue>(
    () => ({ availableWidth, contentWidth, navigationMode, syncWorkspaceWidth }),
    [availableWidth, contentWidth, navigationMode, syncWorkspaceWidth],
  );
  const geometryStyle = {
    '--app-navigation-width': `${APP_NAVIGATION_WIDTH}px`,
    '--app-shell-gap': wide ? `${APP_SHELL_GAP}px` : '0px',
    height: '100dvh',
    ...style,
  } as CSSProperties;

  useLayoutEffect(() => {
    if (wide) {
      navigationOpenRef.current = false;
      navigationFocusTarget.current = undefined;
      setNavigationOpen(false);
    }
  }, [wide]);

  return (
    <AppNavigationContext.Provider value={navigationContext}>
      <AppFloatingProvider supported={wide}>
        <DesignMetadataBoundary excludeComponents={['AppBackground', 'WorkspaceSurface']}>
          <AppBackground
            brandPrimary={brandPrimary}
            ref={shellRef}
            className={cn(
              'relative flex h-screen w-full flex-row items-start justify-center gap-[var(--app-shell-gap)] overflow-hidden',
              className,
            )}
            style={geometryStyle}
            {...props}
            {...capture}
          >
            <Drawer
              open={navigationOpen}
              onOpenChange={(open) => {
                navigationOpenRef.current = open;
                if (open) {
                  navigationFocusTarget.current = undefined;
                  navigationOpener.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                }

                setNavigationOpen(open);
              }}
            >
              {wide ? (
                <aside
                  key="persistent-navigation"
                  className="flex h-full w-[var(--app-navigation-width)] shrink-0 flex-col pt-2"
                  data-app-shell-region="navigation"
                  {...designSlot('AppShell', 'navigation')}
                >
                  {navigation}
                </aside>
              ) : null}

              <AppWorkspaceContext.Provider key="workspace" value={workspaceContext}>
                <WorkspaceSurface
                  as="main"
                  material={workspaceMaterialOwner === 'shell'}
                  // The workspace fit decides the surface width in CSS: `content` is intrinsic,
                  // `available` fills, and `bounded` (the Focused frame) asks for the
                  // `workspace-focused` token, which the max-width clamps to the available width.
                  // The row's `justify-center` then centres navigation and workspace only while
                  // the frame is narrower than the available width. Only the outermost workspace
                  // marker counts (`:not([data-workspace-fit] *)`): a nested workspace never
                  // changes the frame.
                  className={cn(
                    workspaceMaterialOwner === 'shell'
                      ? cn(
                          'mt-4 h-[calc(100%-1rem)] w-max has-[[data-workspace-fit=available]:not([data-workspace-fit]_*)]:w-full has-[[data-workspace-fit=bounded]:not([data-workspace-fit]_*)]:w-workspace-focused min-w-0 max-w-[calc(100%-var(--app-navigation-width)-var(--app-shell-gap))] flex-none overflow-hidden rounded-tl-surface border-t border-l border-workspace-edge',
                          workspaceIsInset && 'rounded-tr-surface border-r',
                        )
                      : 'h-full w-full min-w-0 flex-none overflow-hidden',
                  )}
                  data-app-shell-region="workspace"
                  data-app-shell-workspace-fit={
                    workspaceMaterialOwner === 'shell'
                      ? workspaceIsInset
                        ? 'inset'
                        : 'edge'
                      : undefined
                  }
                  data-app-shell-workspace-material-owner={
                    workspaceMaterialOwner === 'panel' ? 'panel' : undefined
                  }
                  {...designSlot('AppShell', 'workspace')}
                >
                  {children}
                </WorkspaceSurface>
              </AppWorkspaceContext.Provider>

              {!wide ? (
                <DrawerContent
                  key="drawer-navigation"
                  className="max-w-[min(20rem,85vw)]"
                  closeLabel={labels.closeNavigation}
                  side="left"
                  onCloseAutoFocus={(event) => {
                    const target = navigationFocusTarget.current?.() ?? navigationOpener.current;
                    navigationFocusTarget.current = undefined;
                    if (target) {
                      event.preventDefault();
                      target.focus();
                    }
                  }}
                >
                  <DrawerTitle className="sr-only">{labels.navigationTitle}</DrawerTitle>
                  {navigation}
                </DrawerContent>
              ) : null}
            </Drawer>

            <AppFloatingOutlet />
          </AppBackground>
        </DesignMetadataBoundary>
      </AppFloatingProvider>
    </AppNavigationContext.Provider>
  );
}
