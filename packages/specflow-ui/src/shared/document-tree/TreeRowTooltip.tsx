import { useRef, useState, type ReactElement, type RefObject } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nevo/ui';

/**
 * A tree row's tooltip, on hover and on keyboard focus: the full name when the single-line label is
 * clipped, and the `details` (for example a document's type or path) whenever there are any.
 */
export function TreeRowTooltip({
  name,
  details = [],
  children,
}: {
  name: string;
  details?: readonly string[];
  children: (label: RefObject<HTMLSpanElement | null>) => ReactElement;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const isClipped =
          label.current !== null && label.current.scrollWidth > label.current.clientWidth;
        setClipped(isClipped);
        setOpen(next && (isClipped || details.length > 0));
      }}
    >
      <TooltipTrigger asChild>{children(label)}</TooltipTrigger>
      <TooltipContent className="max-w-64 break-words">
        {clipped && <span className="block break-all">{name}</span>}
        {details.map((line, index) => (
          <span key={line} className={clipped || index > 0 ? 'block text-content-muted' : 'block'}>
            {line}
          </span>
        ))}
        {!clipped && details.length === 0 && name}
      </TooltipContent>
    </Tooltip>
  );
}
