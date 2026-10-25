import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
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
          'fixed left-1/2 top-1/2 z-50 flex flex-col max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-surface border border-border-default bg-surface-raised p-5 text-content-primary shadow-2xl outline-none',
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
              className="absolute! right-3 top-3"
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

/**
 * The scrolling body between the fixed header and footer. While more content is below the visible
 * part, its bottom edge shows a quiet separator (`data-more`), so a cut-off list reads as
 * scrollable; the edge is always laid out, so the cue never moves the footer.
 */
export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBody({ className, ...props }, ref) {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const [more, setMore] = useState(false);
    const setRefs = useCallback(
      (element: HTMLDivElement | null) => {
        setNode(element);
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      },
      [ref],
    );
    useEffect(() => {
      if (!node) return;
      const measure = () => setMore(node.scrollTop + node.clientHeight < node.scrollHeight - 1);
      measure();
      node.addEventListener('scroll', measure, { passive: true });
      // Size changes of the body and of its children (re-observed when the content is replaced);
      // without ResizeObserver the scroll position and content changes still update the edge.
      const sizes = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
      const observeAll = () => {
        if (!sizes) return;
        sizes.disconnect();
        sizes.observe(node);
        for (const child of Array.from(node.children)) sizes.observe(child);
      };
      observeAll();
      const content =
        typeof MutationObserver === 'undefined'
          ? undefined
          : new MutationObserver(() => {
              observeAll();
              measure();
            });
      content?.observe(node, { childList: true, subtree: true });
      return () => {
        node.removeEventListener('scroll', measure);
        sizes?.disconnect();
        content?.disconnect();
      };
    }, [node]);
    return (
      <div
        ref={setRefs}
        data-more={more || undefined}
        className={cn(
          'min-h-0 overflow-y-auto border-b border-b-transparent data-[more=true]:border-b-border-subtle',
          className,
        )}
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
        className={cn(
          'flex flex-col-reverse gap-2 *:min-w-0 *:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:*:w-auto',
          className,
        )}
        {...designSlot('Dialog', 'footer')}
        {...props}
      />
    );
  },
);
