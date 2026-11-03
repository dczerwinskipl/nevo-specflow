import { linkVariants } from '../../components/actions/Link';
import { Icon } from '../../components/foundations/Icon';
import { cn } from '../../lib';

/**
 * The split Secondary's default local-depth navigation (`localNavigation: 'back'`), the first row
 * of the active tab's panel while the tab is one or more levels deeper than its root:
 * `← Back to <parent>`. One control that returns to the direct parent; it names where Back goes,
 * never the current page, which names itself right below in its own content (repeating it here
 * showed the same title twice). A long parent name truncates, the arrow and the control stay, so
 * the way back never disappears. Same row height and divider as the breadcrumb row.
 */
export function SecondaryBackRow({
  label,
  onBack,
}: {
  /** The visible text and accessible name, built from the parent level's title. */
  label: string;
  onBack: () => void | Promise<unknown>;
}) {
  return (
    <div
      // Its divider sits at the rail + row = 56px line, continuing Primary's header divider.
      className="flex h-breadcrumb-row min-w-0 shrink-0 items-center border-b border-border-subtle px-3"
      data-workspace-back-row="true"
    >
      <button
        type="button"
        className={cn(
          linkVariants({ tone: 'muted', layout: 'standalone' }),
          'min-w-0 max-w-full gap-1 text-left text-body-sm',
        )}
        onClick={() => void onBack()}
        title={label}
      >
        <Icon aria-hidden name="arrow-right" size="sm" className="shrink-0 rotate-180" />
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </div>
  );
}
