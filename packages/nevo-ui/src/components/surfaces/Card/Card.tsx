import { forwardRef, type HTMLAttributes } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { surfaceVariants } from '../Surface';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const CardRoot = forwardRef<HTMLDivElement, CardProps>(function CardRoot(
  { className, ...props },
  ref,
) {
  const capture = useDesignMetadata('Card');

  return (
    <div
      ref={ref}
      className={cn(
        surfaceVariants({ tone: 'raised' }),
        'grid gap-4 rounded-composite border border-border-subtle p-4',
        className,
      )}
      {...props}
      {...capture}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('grid gap-1', className)}
        {...props}
        {...designSlot('Card', 'header')}
      />
    );
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('min-w-0', className)}
        {...props}
        {...designSlot('Card', 'body')}
      />
    );
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-center justify-end gap-2', className)}
        {...props}
        {...designSlot('Card', 'footer')}
      />
    );
  },
);

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});



