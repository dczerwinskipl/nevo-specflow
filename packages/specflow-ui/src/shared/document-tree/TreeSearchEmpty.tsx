import { Button, EmptyState } from '@nevo/ui';
import { treePaneBlockClassName } from './treePane';

/**
 * A search or filter that leaves nothing in a tree pane: the inline empty state on the pane's text
 * column, without an icon, and one secondary action that removes what hides the rows. The texts
 * and the action are the screen's.
 */
export function TreeSearchEmpty({
  title,
  description,
  clearLabel,
  onClear,
}: {
  title: string;
  description: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <div className={treePaneBlockClassName}>
      <EmptyState
        variant="inline"
        title={title}
        description={description}
        actions={
          <Button variant="secondary" size="sm" onClick={onClear}>
            {clearLabel}
          </Button>
        }
      />
    </div>
  );
}
