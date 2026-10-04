import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export const AlertDialogContent = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & { container?: HTMLElement | null }
>(function AlertDialogContent({ className, container, ...props }, ref) {
  const capture = useDesignMetadata('AlertDialog');
  return (
    <AlertDialogPrimitive.Portal container={container}>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-surface border border-border-default bg-surface-raised p-5 text-content-primary shadow-2xl outline-none',
          className,
        )}
        {...props}
        {...capture}
      />
    </AlertDialogPrimitive.Portal>
  );
});

export const AlertDialogHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AlertDialogHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('grid gap-1', className)} {...props} />;
  },
);

export const AlertDialogTitle = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('m-0 text-title-sm text-content-primary', className)}
      {...designSlot('AlertDialog', 'title')}
      {...props}
    />
  );
});

export const AlertDialogDescription = forwardRef<
  ComponentRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('m-0 text-body-sm text-content-muted', className)}
      {...designSlot('AlertDialog', 'description')}
      {...props}
    />
  );
});

export const AlertDialogFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AlertDialogFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
        {...designSlot('AlertDialog', 'footer')}
        {...props}
      />
    );
  },
);
