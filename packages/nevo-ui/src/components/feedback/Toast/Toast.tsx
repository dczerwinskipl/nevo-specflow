import * as ToastPrimitive from '@radix-ui/react-toast';
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { IconButton } from '../../actions/IconButton';

const defaultToastDismissLabel = 'Dismiss notification';
export const ToastProvider = ToastPrimitive.Provider;
export const ToastViewport = forwardRef<
  ComponentRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(function ToastViewport({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        'fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none',
        className,
      )}
      {...props}
    />
  );
});
export const Toast = forwardRef<
  ComponentRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(function Toast({ className, ...props }, ref) {
  const capture = useDesignMetadata('Toast');
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex flex-col gap-1 rounded-composite border border-border-default bg-surface-raised p-4 pr-12 text-content-primary shadow-2xl',
        className,
      )}
      {...props}
      {...capture}
    />
  );
});
export const ToastTitle = forwardRef<
  ComponentRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(function ToastTitle({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Title
      ref={ref}
      className={cn('m-0 text-label-md text-content-primary', className)}
      {...designSlot('Toast', 'title')}
      {...props}
    />
  );
});
export const ToastDescription = forwardRef<
  ComponentRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(function ToastDescription({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Description
      ref={ref}
      className={cn('text-body-sm text-content-muted', className)}
      {...designSlot('Toast', 'description')}
      {...props}
    />
  );
});
export const ToastAction = ToastPrimitive.Action;
export const ToastClose = forwardRef<
  ComponentRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close> & {
    dismissLabel?: string;
  }
>(function ToastClose({ dismissLabel, ...props }, ref) {
  return (
    <ToastPrimitive.Close ref={ref} asChild {...props}>
      <IconButton
        aria-label={dismissLabel ?? defaultToastDismissLabel}
        className="absolute right-2 top-2"
        icon="close"
        size="xs"
        variant="ghost"
        {...designSlot('Toast', 'close')}
      />
    </ToastPrimitive.Close>
  );
});
