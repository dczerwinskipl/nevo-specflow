import type { ReactNode } from 'react';
import { IconButton } from '../../components/actions/IconButton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/overlays/Tooltip';

/**
 * The split Secondary's default local-depth navigation (`localNavigation: 'back'`), the first,
 * non-scrolling row of the active tab's panel while the tab is one or more levels deeper than its
 * root: a `←` Back that returns to the direct parent, followed by the screen's `detailHeader` (the
 * object's identity: title, status), so no second bar is needed and the tab rail above keeps its
 * constant height at every depth. Back names where it goes ("Back to <parent>") in its accessible
 * name and tooltip, never the current page, which names itself in the `detailHeader`. A screen that
 * declares none shows Back alone. The content below scrolls; this row does not (a very long
 * `detailHeader` scrolls inside the row's own height cap).
 */
export function SecondaryDetailHeaderRow({
  backLabel,
  onBack,
  children,
}: {
  /** The accessible name and tooltip of Back, built from the parent level's title. */
  backLabel: string;
  onBack: () => void | Promise<unknown>;
  /** The screen's declared header content. */
  children?: ReactNode;
}) {
  return (
    <div
      className="flex max-h-40 min-w-0 shrink-0 items-start gap-1 overflow-y-auto px-2 pt-2"
      data-workspace-detail-header="true"
    >
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label={backLabel}
              className="[&_svg]:rotate-180"
              data-workspace-back="true"
              icon="arrow-right"
              onClick={() => void onBack()}
              size="sm"
              variant="ghost"
            />
          </TooltipTrigger>
          <TooltipContent>{backLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* `pt-1.5` centres the header's title line (20px) on the 32px Back control. */}
      <div className="min-w-0 flex-1 pr-2 pt-1.5">{children}</div>
    </div>
  );
}
