import {
  createContext,
  useContext,
  useMemo,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../lib';
import { ScrollArea } from '../../components/layout/ScrollArea';

/**
 * The body's padding. Its inline part is exposed as `--app-body-padding-inline` for content that
 * spans it to the sheet edges (`AccentBlock bleed`); change the inline padding through the variable,
 * not with a `px-*` class, so the two never disagree.
 */
const bodyPadding = {
  none: '[--app-body-padding-inline:0px]',
  sm: 'p-3 px-(--app-body-padding-inline) [--app-body-padding-inline:--spacing(3)]',
  md: 'p-4 px-(--app-body-padding-inline) [--app-body-padding-inline:--spacing(4)]',
} as const;

const appWorkspaceBodyVariants = tv({
  base: 'min-h-0 flex-1 overflow-y-auto',
  variants: {
    padding: bodyPadding,
  },
  defaultVariants: {
    padding: 'md',
  },
});

/** The scroll an ancestor owns for the content: a stacked surface's page `ScrollArea`. */
export interface AppContentScrollOwner {
  /** The element that scrolls, once mounted. */
  element: HTMLElement | null;
  /**
   * How much of the scroller's top edge the surface's own controls cover once its header has
   * scrolled away (the floating navigation row): content brought to the top belongs below it.
   */
  coveredTop: () => number;
}

const AppContentScrollContext = createContext<AppContentScrollOwner | null>(null);

export function AppContentScrollProvider({
  element = null,
  coveredTop,
  children,
}: PropsWithChildren<{ element?: HTMLElement | null; coveredTop?: () => number }>) {
  const value = useMemo(
    () => ({ element, coveredTop: coveredTop ?? (() => 0) }),
    [element, coveredTop],
  );

  return (
    <AppContentScrollContext.Provider value={value}>{children}</AppContentScrollContext.Provider>
  );
}

/**
 * The scroll an ancestor owns for this content (a stacked surface scrolls its whole page, header
 * included), or `null` where the content owns its own scroll (a split surface, `scroll="content"`).
 * A screen that keeps a reading position or brings an entry to the top reads and writes this
 * element on a stacked layout and its own scroller otherwise. Primary and Secondary alike.
 */
export function useAppContentScrollOwner(): AppContentScrollOwner | null {
  return useContext(AppContentScrollContext);
}

const appContentContainerVariants = tv({
  // Named so a descendant can query this container exactly (`AccentBlock bleed="narrow"`); unnamed
  // container queries still match it as the nearest container.
  base: '@container/app-content min-w-0 max-w-full',
  variants: {
    align: {
      start: '',
      center: 'mx-auto',
      end: 'ml-auto',
    },
    size: {
      narrow: 'w-content-narrow',
      standard: 'w-content-standard',
      wide: 'w-content-wide',
      xwide: 'w-content-xwide',
      full: 'w-full',
    },
  },
  defaultVariants: {
    align: 'center',
    size: 'standard',
  },
});

export function AppContent({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const ancestorOwnsScroll = useContext(AppContentScrollContext) !== null;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col',
        ancestorOwnsScroll ? 'min-h-full' : 'h-full',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppWorkspaceHeader({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4',
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}

export function AppWorkspaceBody({
  children,
  className,
  contentClassName,
  tabIndex = 0,
  padding = 'md',
  scroll = 'native',
  ...props
}: PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    /**
     * Classes for the padded content box. In `scroll="area"` they are merged after the `padding`
     * preset on the ScrollArea content (so `py-6` refines `md`), where `className` styles the
     * ScrollArea root; in `native` mode they apply to the body element itself.
     */
    contentClassName?: string;
    padding?: 'none' | 'sm' | 'md';
    scroll?: 'native' | 'area';
  }
>) {
  const ancestorOwnsScroll = useContext(AppContentScrollContext) !== null;

  if (scroll === 'area' && !ancestorOwnsScroll) {
    return (
      <ScrollArea
        {...props}
        className={cn('min-h-0 flex-1 w-full', className)}
        contentClassName={cn(bodyPadding[padding], contentClassName)}
        tabIndex={tabIndex}
      >
        {children}
      </ScrollArea>
    );
  }

  return (
    <div
      className={cn(
        appWorkspaceBodyVariants({ padding }),
        ancestorOwnsScroll && 'min-h-auto flex-none overflow-visible',
        className,
        contentClassName,
      )}
      tabIndex={ancestorOwnsScroll ? undefined : tabIndex}
      {...props}
    >
      {children}
    </div>
  );
}

export type AppContentContainerSize = 'narrow' | 'standard' | 'wide' | 'xwide' | 'full';

export interface AppContentContainerProps extends HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  size?: AppContentContainerSize;
}

export function AppContentContainer({
  align = 'center',
  children,
  className,
  size = 'standard',
  ...props
}: AppContentContainerProps) {
  return (
    <div className={cn(appContentContainerVariants({ align, size }), className)} {...props}>
      {children}
    </div>
  );
}
