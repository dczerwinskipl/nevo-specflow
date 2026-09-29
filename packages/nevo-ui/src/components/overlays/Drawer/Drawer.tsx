import * as Dialog from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
} from 'react';
import { designLayerMetadata, designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { typographyTextStyleRef } from '../../../design-system/resources';
import { IconButton } from '../../actions/IconButton';
import './Drawer.css';

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

export type DrawerContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
  container?: HTMLElement | null;
  overlayClassName?: string;
  side?: 'left' | 'right';
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
            'drawer-panel fixed inset-y-0 z-50 flex w-full flex-col bg-surface-raised text-content-primary shadow-2xl outline-none sm:w-[28rem] md:w-[30rem]',
            side === 'left'
              ? 'left-0 border-r border-border-default'
              : 'right-0 border-l border-border-default',
            className,
          )}
          data-side={side}
          {...props}
          {...capture}
        >
          {children}
          {showClose ? (
            <Dialog.Close asChild>
              <IconButton
                aria-label={closeLabel!}
                className="absolute right-4 top-4"
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
    return (
      <div
        ref={ref}
        className={cn('border-b border-divider px-5 py-4 pr-14', className)}
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

export const DrawerBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DrawerBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)}
        {...props}
        {...designSlot('Drawer', 'body')}
      />
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
