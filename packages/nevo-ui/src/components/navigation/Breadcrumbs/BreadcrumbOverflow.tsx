import { IconButton } from '../../actions/IconButton';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../overlays/Menu';
import type { BreadcrumbItemElement } from './BreadcrumbItem';

function activate(item: BreadcrumbItemElement) {
  const { onPress, href } = item.props;
  if (onPress) {
    onPress();
  } else if (href && typeof window !== 'undefined') {
    window.location.assign(href);
  }
}

/**
 * The `…` segment of a collapsed trail: a menu listing the folded middle segments in trail order,
 * so every ancestor stays reachable at any width. Router-driven trails should give their items
 * `onPress` (an `href` here performs a plain document navigation).
 */
export function BreadcrumbOverflow({
  items,
  label,
}: {
  items: readonly BreadcrumbItemElement[];
  label: string;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label={label} icon="ellipsis" size="xs" variant="ghost" />
      </MenuTrigger>
      <MenuContent align="start">
        {items.map((item, index) => (
          <MenuItem key={item.key ?? index} onSelect={() => activate(item)}>
            {item.props.children}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
