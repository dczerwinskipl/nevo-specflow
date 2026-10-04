import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { IconButton } from '../../actions/IconButton';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogLabels {
  close: string;
}

const defaultDialogLabels: DialogLabels = { close: 'Close dialog' };

export const DialogContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    container?: HTMLElement | null;
    labels?: Partial<DialogLabels>;
    closeLabel?: string;
    showClose?: boolean;
  }
>(function DialogContent(
  { children, className, container, closeLabel, labels: labelsProp, showClose = true, ...props },
  ref,
) {
  const capture = useDesignMetadata('Dialog');
  const labels = { ...defaultDialogLabels, ...labelsProp };
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-surface border border-border-default bg-surface-raised p-5 text-content-primary shadow-2xl outline-none',
          className,
        )}
        {...props}
        {...capture}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close asChild>
            <IconButton
              aria-label={closeLabel ?? labels.close}
              className="absolute right-3 top-3"
              icon="close"
              size="sm"
              variant="ghost"
              {...designSlot('Dialog', 'close')}
            />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export const DialogHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('grid gap-1 pr-8', className)} {...props} />;
  },
);

export const DialogTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('m-0 text-title-sm text-content-primary', className)}
      {...designSlot('Dialog', 'title')}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('m-0 text-body-sm text-content-muted', className)}
      {...designSlot('Dialog', 'description')}
      {...props}
    />
  );
});

export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('min-h-0 overflow-y-auto', className)}
        {...designSlot('Dialog', 'body')}
        {...props}
      />
    );
  },
);

export const DialogFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
        {...designSlot('Dialog', 'footer')}
        {...props}
      />
    );
  },
);
