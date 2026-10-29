import * as Dialog from '@radix-ui/react-dialog';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
} from 'react';
import { designLayerMetadata, designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { typographyTextStyleRef } from '../../../design-system/resources';
import { IconButton } from '../../actions/IconButton';
import { ScrollArea } from '../../layout/ScrollArea';

export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;

export const DrawerOverlay = forwardRef<
  ComponentRef<typeof Dialog.Overlay>,
  ComponentPropsWithoutRef<typeof Dialog.Overlay>
>(function DrawerOverlay({ className, ...props }, ref) {
  return (
    <Dialog.Overlay
      ref={ref}
      className={cn('drawer-overlay fixed inset-0 z-40 bg-overlay', className)}
      {...props}
      {...designLayerMetadata({ layer: 'overlay' })}
    />
  );
});

type DrawerCloseActionProps =
  { showClose?: true; closeLabel: string } | { showClose: false; closeLabel?: never };

/** Edge a Drawer is anchored to. `left`/`right` are side panels; `top`/`bottom` are sheets. */
export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

const drawerPanelBaseClassName =
  'drawer-panel fixed z-50 flex flex-col bg-surface-raised text-content-primary shadow-2xl outline-none';

const drawerSideClassNames: Record<DrawerSide, string> = {
  right: 'inset-y-0 right-0 w-full border-l border-border-default sm:w-[28rem] md:w-[30rem]',
  left: 'inset-y-0 left-0 w-full border-r border-border-default sm:w-[28rem] md:w-[30rem]',
  // Sheets: full width on phones, a centred 30rem column (the side-panel width) from the medium breakpoint.
  // Centring uses auto margins (not a transform) so the slide animation owns `transform`.
  bottom:
    'inset-x-0 bottom-0 w-full rounded-t-surface border border-b-0 border-border-default pb-[env(safe-area-inset-bottom)] md:mx-auto md:w-[30rem] md:max-w-full',
  top: 'inset-x-0 top-0 w-full rounded-b-surface border border-t-0 border-border-default pt-[env(safe-area-inset-top)] md:mx-auto md:w-[30rem] md:max-w-full',
};

/** Height cap of a top/bottom sheet. `compact` keeps more of the page visible; side panels ignore it. */
export type DrawerSize = 'default' | 'compact';

const drawerSheetMaxHeightClassNames: Record<DrawerSize, string> = {
  default: 'max-h-[calc(100dvh-3rem)]',
  compact: 'max-h-[65dvh]',
};

/** Lets `DrawerHeader` reserve room for the built-in close action only when it is rendered. */
const DrawerCloseContext = createContext(true);

const drawerCloseClassName = 'absolute! right-4 top-4';
const drawerTopCloseClassName = 'absolute! right-4 top-[calc(1rem+env(safe-area-inset-top))]';

export type DrawerContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
  container?: HTMLElement | null;
  overlayClassName?: string;
  side?: DrawerSide;
  /** Top/bottom sheets only: `compact` caps the height at 65dvh instead of `calc(100dvh - 3rem)`. */
  size?: DrawerSize;
} & DrawerCloseActionProps;

export const DrawerContent = forwardRef<ComponentRef<typeof Dialog.Content>, DrawerContentProps>(
  function DrawerContent(
    {
      children,
      className,
      closeLabel,
      container,
      overlayClassName,
      showClose = true,
      side = 'right',
      size = 'default',
      ...props
    },
    ref,
  ) {
    const capture = useDesignMetadata('Drawer');

    return (
      <Dialog.Portal container={container}>
        <DrawerOverlay className={overlayClassName} />
        <Dialog.Content
          ref={ref}
          className={cn(
            drawerPanelBaseClassName,
            drawerSideClassNames[side],
            (side === 'top' || side === 'bottom') && drawerSheetMaxHeightClassNames[size],
            className,
          )}
          data-side={side}
          {...props}
          {...capture}
        >
          <DrawerCloseContext.Provider value={showClose}>{children}</DrawerCloseContext.Provider>
          {showClose ? (
            <Dialog.Close asChild>
              <IconButton
                aria-label={closeLabel!}
                className={side === 'top' ? drawerTopCloseClassName : drawerCloseClassName}
                icon="close"
                size="sm"
                variant="ghost"
                {...designSlot('Drawer', 'closeAction')}
              />
            </Dialog.Close>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    );
  },
);

export const DrawerHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DrawerHeader({ className, ...props }, ref) {
    const hasCloseAction = useContext(DrawerCloseContext);

    return (
      <div
        ref={ref}
        className={cn('border-b border-divider px-5 py-4', hasCloseAction && 'pr-14', className)}
        {...props}
        {...designSlot('Drawer', 'header')}
      />
    );
  },
);

export const DrawerTitle = forwardRef<
  ComponentRef<typeof Dialog.Title>,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  const capture = useDesignMetadata(
    'Typography',
    {},
    {
      textFlow: true,
      textStyleRef: typographyTextStyleRef('title-sm'),
    },
  );

  return (
    <Dialog.Title
      ref={ref}
      className={cn('m-0 text-title-sm text-content-primary', className)}
      {...props}
      {...designLayerMetadata({ layer: 'title' })}
      {...capture}
    />
  );
});

export const DrawerDescription = forwardRef<
  ComponentRef<typeof Dialog.Description>,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>(function DrawerDescription({ className, ...props }, ref) {
  const capture = useDesignMetadata(
    'Typography',
    {},
    {
      textFlow: true,
      textStyleRef: typographyTextStyleRef('body-sm'),
    },
  );

  return (
    <Dialog.Description
      ref={ref}
      className={cn('mb-0 mt-1 text-body-sm text-content-muted', className)}
      {...props}
      {...designLayerMetadata({ layer: 'description' })}
      {...capture}
    />
  );
});

/**
 * The scrolling body of a Drawer: a DS `ScrollArea` (thin scrollbar, edge indicators), so a drawer
 * never shows a native unstyled scrollbar. The viewport is a keyboard-focusable scroll region
 * (`tabIndex` 0) so content without focusable children can still be scrolled with the keyboard.
 * `className` styles the padded content wrapper (default `px-5 py-5`). The root is a flex column so the
 * viewport can shrink and scroll inside a content-sized top/bottom sheet (indefinite height).
 */
export const DrawerBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DrawerBody({ children, className, ...props }, ref) {
    return (
      <ScrollArea
        ref={ref}
        className="flex min-h-0 flex-1 flex-col"
        contentClassName={cn('px-5 py-5', className)}
        direction="vertical"
        {...props}
        {...designSlot('Drawer', 'body')}
      >
        {children}
      </ScrollArea>
    );
  },
);

export const DrawerFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DrawerFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex shrink-0 flex-col-reverse gap-2 border-t border-divider px-5 py-4 sm:flex-row sm:justify-end',
          className,
        )}
        {...props}
        {...designSlot('Drawer', 'footer')}
      />
    );
  },
);
