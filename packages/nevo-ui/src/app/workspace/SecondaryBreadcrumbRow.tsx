import { IconButton } from '../../components/actions/IconButton';
import { BreadcrumbItem, Breadcrumbs } from '../../components/navigation/Breadcrumbs';
import type { SecondaryTrailItem } from './secondaryTrail';

export interface SecondaryBreadcrumbLabels {
  /** The trail's `nav` name. */
  navigation: string;
  /** The `…` menu trigger of a collapsed trail. */
  collapsed: string;
  /** The leading one-level Back, given the title of the level it returns to. */
  back: (parentTitle: string) => string;
}

/**
 * The split Secondary's local-depth navigation, the first row of the active tab's panel while the
 * tab is deeper than its root: `← Root › … › Parent › Current`. The leading `←` pops one level;
 * every ancestor segment pops straight back to its level (the root segment returns to the tab's
 * root list); the current level is plain text. Generic over any stack — segments are the entries'
 * own titles (`secondaryTrail.ts`), never paths.
 */
export function SecondaryBreadcrumbRow({
  trail,
  labels,
  onBack,
  onBackTo,
}: {
  trail: readonly SecondaryTrailItem[];
  labels: SecondaryBreadcrumbLabels;
  onBack: () => void | Promise<unknown>;
  /** Pops to `depth` levels (1 = root). */
  onBackTo: (depth: number) => void | Promise<unknown>;
}) {
  const parent = trail.at(-2);
  if (!parent) {
    return null;
  }

  return (
    <Breadcrumbs
      className="h-breadcrumb-row shrink-0 px-3"
      collapsedLabel={labels.collapsed}
      data-workspace-breadcrumbs="true"
      label={labels.navigation}
      leading={
        <IconButton
          aria-label={labels.back(parent.title)}
          className="[&_svg]:rotate-180"
          icon="arrow-right"
          onClick={() => void onBack()}
          size="xs"
          variant="ghost"
        />
      }
      overflow="collapse"
    >
      {trail.map((item, index) =>
        index === trail.length - 1 ? (
          <BreadcrumbItem key={item.key}>{item.title}</BreadcrumbItem>
        ) : (
          <BreadcrumbItem key={item.key} onPress={() => void onBackTo(index + 1)}>
            {item.title}
          </BreadcrumbItem>
        ),
      )}
    </Breadcrumbs>
  );
}
