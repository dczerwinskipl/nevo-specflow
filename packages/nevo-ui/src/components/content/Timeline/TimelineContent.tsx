import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { Typography } from '../../foundations/Typography';
import { useTimelineSize } from './timelineContext';

const contentVariants = tv({
  base: 'min-w-0',
  variants: {
    size: {
      sm: 'pb-2 group-last/timeline-item:pb-0',
      md: 'pb-5 group-last/timeline-item:pb-0',
    },
  },
});

const descriptionVariants = tv({
  base: 'text-content-secondary',
  variants: {
    size: {
      md: 'mt-1',
    },
  },
});

const metaVariants = tv({
  base: 'text-content-muted',
  variants: {
    size: {
      md: 'mt-1.5',
    },
  },
});

const extraContentVariants = tv({
  variants: {
    size: {
      sm: 'mt-1',
      md: 'mt-2.5',
    },
  },
});

function hasRenderableValue(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === 'boolean') return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.some(hasRenderableValue);
  return true;
}

function CompactContent({
  children,
  description,
  meta,
  time,
  title,
}: Pick<TimelineContentProps, 'children' | 'description' | 'meta' | 'time' | 'title'>) {
  const hasDescription = hasRenderableValue(description);
  const hasMeta = hasRenderableValue(meta);
  const hasTime = hasRenderableValue(time);
  const hasInlineDetail = hasDescription || hasMeta;
  const inlineDetail = hasDescription ? description : meta;
  const hasSecondaryMeta = hasDescription && hasMeta;

  return (
    <>
      <div
        className={cn(
          'min-w-0',
          hasTime && 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2',
        )}
      >
        <div className="flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
          <Typography
            as="span"
            variant="label-sm"
            className="min-w-0 truncate text-content-primary"
          >
            {title}
          </Typography>
          {hasInlineDetail ? (
            <>
              <span aria-hidden="true" className="shrink-0 text-body-sm text-content-muted">
                ·
              </span>
              <Typography
                as="span"
                variant="body-sm"
                className="min-w-0 truncate text-content-secondary"
              >
                {inlineDetail}
              </Typography>
            </>
          ) : null}
        </div>
        {hasTime ? (
          <Typography
            as="span"
            variant="body-sm"
            className="shrink-0 whitespace-nowrap text-content-muted tabular-nums"
          >
            {time}
          </Typography>
        ) : null}
      </div>

      {hasSecondaryMeta ? (
        <Typography
          as="div"
          variant="body-sm"
          className="mt-0.5 min-w-0 truncate text-content-muted"
        >
          {meta}
        </Typography>
      ) : null}

      {hasRenderableValue(children) ? (
        <div className={cn('min-w-0', extraContentVariants({ size: 'sm' }))}>{children}</div>
      ) : null}
    </>
  );
}

export interface TimelineContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  children?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  time?: ReactNode;
  title: ReactNode;
}

export const TimelineContent = forwardRef<HTMLDivElement, TimelineContentProps>(
  function TimelineContent({ children, className, description, meta, time, title, ...props }, ref) {
    const size = useTimelineSize('Timeline.Content');

    if (size === 'sm') {
      return (
        <div ref={ref} className={cn(contentVariants({ size }), className)} {...props}>
          <CompactContent title={title} description={description} meta={meta} time={time}>
            {children}
          </CompactContent>
        </div>
      );
    }

    const hasTime = hasRenderableValue(time);

    return (
      <div ref={ref} className={cn(contentVariants({ size }), className)} {...props}>
        <div
          className={cn(
            'min-w-0',
            hasTime && 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3',
          )}
        >
          <Typography
            as="div"
            variant="title-sm"
            className="min-w-0 break-words text-content-primary"
          >
            {title}
          </Typography>
          {hasTime ? (
            <Typography
              as="span"
              variant="body-sm"
              className="shrink-0 whitespace-nowrap text-content-muted tabular-nums"
            >
              {time}
            </Typography>
          ) : null}
        </div>

        {hasRenderableValue(description) ? (
          <Typography
            as="div"
            variant="body-md"
            className={cn('min-w-0 break-words', descriptionVariants({ size }))}
          >
            {description}
          </Typography>
        ) : null}

        {hasRenderableValue(meta) ? (
          <Typography
            as="div"
            variant="body-sm"
            className={cn('min-w-0 break-words', metaVariants({ size }))}
          >
            {meta}
          </Typography>
        ) : null}

        {hasRenderableValue(children) ? (
          <div className={cn('min-w-0', extraContentVariants({ size }))}>{children}</div>
        ) : null}
      </div>
    );
  },
);

