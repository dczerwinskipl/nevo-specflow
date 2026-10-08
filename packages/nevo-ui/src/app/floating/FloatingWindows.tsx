import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { IconButton } from '../../components/actions/IconButton';
import { Icon } from '../../components/foundations/Icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/overlays/Menu';
import { fastColorTransitionClassName } from '../../design-system/interactionRecipes';
import type { IconGlyph } from '../../components/foundations/Icon';
import { cn } from '../../lib';
import {
  resolveFloatingWindowLayout,
  type FloatingWindowLayoutEntry,
} from './floatingWindowLayout';

interface FloatingRegistration extends FloatingWindowLayoutEntry {
  title: ReactNode;
  focusHeader: () => void;
  notification: boolean;
}

interface FloatingWindowsContextValue {
  expandedId: string | null;
  isVisible: (id: string) => boolean;
  register: (registration: Omit<FloatingRegistration, 'sequence' | 'lastActivatedAt'>) => void;
  unregister: (id: string) => void;
  expand: (id: string) => void;
  minimize: (id: string) => void;
  requestClose: (id: string, onClose: () => void) => void;
}

const FloatingWindowsContext = createContext<FloatingWindowsContextValue | null>(null);

function useFloatingWindowsContext(part: string) {
  const context = useContext(FloatingWindowsContext);
  if (!context) {
    throw new Error(`${part} must be rendered inside FloatingWindowHost.`);
  }
  return context;
}

export interface FloatingWindowHostLabels {
  moreWindows: string;
}

const defaultFloatingWindowHostLabels: FloatingWindowHostLabels = {
  moreWindows: 'More floating windows',
};

export interface FloatingWindowHostProps extends HTMLAttributes<HTMLDivElement> {
  labels?: Partial<FloatingWindowHostLabels>;
  maxVisible?: number;
  /** Icon rendered by the generic overflow hub. */
  overflowIcon?: IconGlyph;
}

export function FloatingWindowHost({
  children,
  className,
  labels: labelsProp,
  maxVisible = 3,
  overflowIcon = 'ellipsis',
  ...props
}: FloatingWindowHostProps) {
  const labels = {
    ...defaultFloatingWindowHostLabels,
    ...labelsProp,
  };
  const [registrations, setRegistrations] = useState<FloatingRegistration[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const activityRef = useRef(0);
  const pendingFocusRef = useRef<string | null>(null);

  const safeMaxVisible = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : 3;

  const layout = useMemo(
    () =>
      resolveFloatingWindowLayout({
        activeId,
        entries: registrations,
        expandedId,
        maxVisible: safeMaxVisible,
      }),
    [activeId, expandedId, registrations, safeMaxVisible],
  );

  const register = useCallback(
    (registration: Omit<FloatingRegistration, 'sequence' | 'lastActivatedAt'>) => {
      setRegistrations((current) => {
        const existing = current.find((item) => item.id === registration.id);

        if (existing) {
          if (
            existing.title === registration.title &&
            existing.focusHeader === registration.focusHeader &&
            existing.notification === registration.notification
          ) {
            return current;
          }

          return current.map((item) =>
            item.id === registration.id ? { ...item, ...registration } : item,
          );
        }

        return [
          ...current,
          {
            ...registration,
            sequence: sequenceRef.current++,
            lastActivatedAt: 0,
          },
        ];
      });
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    setRegistrations((current) => current.filter((item) => item.id !== id));
    setExpandedId((current) => (current === id ? null : current));
    setActiveId((current) => (current === id ? null : current));
  }, []);

  const activate = useCallback((id: string) => {
    const activity = ++activityRef.current;

    setActiveId(id);
    setRegistrations((current) =>
      current.map((item) => (item.id === id ? { ...item, lastActivatedAt: activity } : item)),
    );
  }, []);

  const expand = useCallback(
    (id: string) => {
      pendingFocusRef.current = id;
      activate(id);
      setExpandedId(id);
    },
    [activate],
  );

  const minimize = useCallback((id: string) => {
    pendingFocusRef.current = id;
    setExpandedId((current) => (current === id ? null : current));
  }, []);

  const requestClose = useCallback(
    (id: string, onClose: () => void) => {
      const currentIndex = layout.visibleIds.indexOf(id);

      pendingFocusRef.current =
        layout.visibleIds[currentIndex + 1] ??
        layout.visibleIds[currentIndex - 1] ??
        'first-visible';

      setExpandedId((current) => (current === id ? null : current));
      setActiveId((current) => (current === id ? null : current));
      onClose();
    },
    [layout.visibleIds],
  );

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;

    const targetId = target === 'first-visible' ? layout.visibleIds[0] : target;

    if (!targetId) {
      pendingFocusRef.current = null;
      return;
    }

    const registration = registrations.find((item) => item.id === targetId);
    if (!registration) return;

    pendingFocusRef.current = null;
    registration.focusHeader();
  }, [layout.visibleIds, registrations]);

  const visibleSet = useMemo(() => new Set(layout.visibleIds), [layout.visibleIds]);

  const value = useMemo<FloatingWindowsContextValue>(
    () => ({
      expandedId,
      isVisible: (id) => visibleSet.has(id),
      register,
      unregister,
      expand,
      minimize,
      requestClose,
    }),
    [expand, expandedId, minimize, register, requestClose, unregister, visibleSet],
  );

  const overflow = layout.overflowIds
    .map((id) => registrations.find((registration) => registration.id === id))
    .filter((registration): registration is FloatingRegistration => Boolean(registration));
  const hasHiddenNotification = overflow.some((registration) => registration.notification);
  const overflowCountLabel = overflow.length > 99 ? '99+' : String(overflow.length);

  return (
    <FloatingWindowsContext.Provider value={value}>
      <div
        className={cn(
          'pointer-events-auto absolute bottom-0 right-4 flex max-w-[calc(100%-1rem)] items-end',
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 items-end gap-2">{children}</div>

        {overflow.length > 0 ? (
          <div className="ml-4 flex h-control-height-default shrink-0 items-center">
            <Menu>
              <MenuTrigger asChild>
                <button
                  aria-label={`${labels.moreWindows} (${overflow.length})`}
                  className={cn(
                    'inline-flex h-control-height-compact shrink-0 cursor-pointer items-center gap-1.5 rounded-composite bg-surface-raised px-2.5 text-content-primary hover:bg-surface-hover',
                    fastColorTransitionClassName,
                  )}
                  type="button"
                >
                  <Icon name={overflowIcon} size="md" />
                  {hasHiddenNotification ? (
                    <span
                      aria-hidden="true"
                      className="size-status-indicator-sm shrink-0 rounded-full bg-action-primary"
                    />
                  ) : null}
                  <span className="min-w-3 text-center text-label-sm text-content-primary">
                    {overflowCountLabel}
                  </span>
                </button>
              </MenuTrigger>

              <MenuContent align="end" side="top" sideOffset={8}>
                {overflow.map((registration) => (
                  <MenuItem key={registration.id} onSelect={() => expand(registration.id)}>
                    {registration.title}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
        ) : null}
      </div>
    </FloatingWindowsContext.Provider>
  );
}

const floatingWindowVariants = tv({
  base: 'group/window min-w-0 shrink-0 overflow-hidden rounded-b-none rounded-t-composite border border-b-0',
  variants: {
    expanded: {
      true: 'w-floating-window-expanded max-w-[calc(100vw-2rem)] border-border-default bg-surface-raised shadow-2xl',
      false:
        'w-floating-window-collapsed border-border-default bg-surface-raised hover:border-border-strong hover:bg-surface-hover',
    },
    notification: {
      true: 'border-action-primary/60',
      false: '',
    },
  },
  compoundVariants: [
    {
      expanded: false,
      notification: true,
      class: 'bg-action-primary/10 hover:bg-action-primary/15',
    },
  ],
  defaultVariants: {
    expanded: false,
    notification: false,
  },
});

const floatingWindowTitleVariants = tv({
  base: `flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left text-label-sm ${fastColorTransitionClassName}`,
  variants: {
    expanded: {
      true: 'text-content-primary',
      false: 'text-content-secondary group-hover/window:text-content-primary',
    },
    notification: {
      true: 'text-content-primary',
      false: '',
    },
  },
  defaultVariants: {
    expanded: false,
    notification: false,
  },
});

export interface FloatingWindowLabels {
  close: string;
  minimize: string;
}

const defaultFloatingWindowLabels: FloatingWindowLabels = {
  close: 'Close floating window',
  minimize: 'Minimize floating window',
};

export interface FloatingWindowProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'title'
> {
  id: string;
  /** Non-interactive title rendered in header and overflow menu. */
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  labels?: Partial<FloatingWindowLabels>;
  /** Consumer-controlled unread/activity cue using primary accent. */
  notification?: boolean;
  onClose?: () => void;
}

export const FloatingWindow = forwardRef<HTMLDivElement, FloatingWindowProps>(
  function FloatingWindow(
    {
      actions,
      children,
      className,
      id,
      labels: labelsProp,
      notification = false,
      onClose,
      title,
      ...props
    },
    ref,
  ) {
    const labels = {
      ...defaultFloatingWindowLabels,
      ...labelsProp,
    };
    const host = useFloatingWindowsContext('FloatingWindow');
    const headerRef = useRef<HTMLButtonElement>(null);
    const focusHeader = useCallback(() => headerRef.current?.focus(), []);
    const { register, unregister } = host;

    useLayoutEffect(
      () => () => {
        unregister(id);
      },
      [id, unregister],
    );

    useLayoutEffect(() => {
      register({ id, title, focusHeader, notification });
    }, [focusHeader, id, notification, register, title]);

    if (!host.isVisible(id)) return null;

    const expanded = host.expandedId === id;
    const contentId = `${id}-floating-content`;

    return (
      <div
        ref={ref}
        id={id}
        className={cn(
          floatingWindowVariants({
            expanded,
            notification,
          }),
          className,
        )}
        data-notification={notification || undefined}
        data-state={expanded ? 'expanded' : 'collapsed'}
        {...props}
      >
        <div
          className={cn(
            'flex h-control-height-default items-center',
            expanded && 'border-b border-divider',
          )}
        >
          <button
            ref={headerRef}
            aria-controls={contentId}
            aria-expanded={expanded}
            className={floatingWindowTitleVariants({
              expanded,
              notification,
            })}
            onClick={() => (expanded ? host.minimize(id) : host.expand(id))}
            type="button"
          >
            {notification && !expanded ? (
              <span
                aria-hidden="true"
                className="size-status-indicator-sm shrink-0 rounded-full bg-action-primary"
              />
            ) : null}

            <span className="min-w-0 flex-1 truncate">{title}</span>
          </button>

          {expanded ? (
            <div className="flex shrink-0 items-center gap-1 pr-1">
              {actions}

              <IconButton
                aria-label={labels.minimize}
                icon="minimize"
                onClick={() => host.minimize(id)}
                size="xs"
                variant="ghost"
              />

              {onClose ? (
                <IconButton
                  aria-label={labels.close}
                  icon="close"
                  onClick={() => host.requestClose(id, onClose)}
                  size="xs"
                  variant="ghost"
                />
              ) : null}
            </div>
          ) : onClose ? (
            <div className="shrink-0 pr-1">
              <IconButton
                aria-label={labels.close}
                icon="close"
                onClick={() => host.requestClose(id, onClose)}
                size="xs"
                variant="ghost"
              />
            </div>
          ) : null}
        </div>

        {expanded ? (
          <div className="min-h-0 max-h-[min(70vh,40rem)] overflow-auto bg-surface" id={contentId}>
            {children}
          </div>
        ) : null}
      </div>
    );
  },
);
