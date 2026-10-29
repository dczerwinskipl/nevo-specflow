import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography,
  cn,
  treeBranchClassName,
  treeItemLabelTruncateClassName,
  treeLinkItemClassName,
  treeNodeClassName,
  treeRootClassName,
  treeSectionHeaderClassName,
} from '@nevo/ui';
import type { OutlineHeading } from './markdownOutline';

interface OutlineNode {
  heading: OutlineHeading;
  children: OutlineNode[];
}

/**
 * The headings as a tree by their real levels: a heading holds the deeper ones that follow it
 * until the next heading of its level or higher. Only H2 gives a flat list; a skipped level
 * (`##` then `####`) nests one step, not two.
 */
export function outlineTree(headings: readonly OutlineHeading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const open: OutlineNode[] = [];
  for (const heading of headings) {
    const node: OutlineNode = { heading, children: [] };
    while (open.length > 0 && open.at(-1)!.heading.level >= heading.level) open.pop();
    (open.at(-1)?.children ?? roots).push(node);
    open.push(node);
  }
  return roots;
}

/**
 * The headings as a compact tree of links, one renderer for the column beside the text and for
 * the sheet, in the file tree's family (`treeLinkItemClassName`): one row height, one indent step
 * per real level, normal weight, and the current section a quiet tint with an accent bar. The
 * column keeps one truncated line (full title in the tooltip); the sheet wraps to two lines. Touch
 * keeps a 44 px hit area without taller rows.
 */
export function OutlineEntries({
  headings,
  activeLine,
  variant,
  focusRef,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  activeLine?: number;
  variant: 'column' | 'sheet';
  /** Receives the entry to focus first: the current one, else the first one. */
  focusRef?: Ref<HTMLAnchorElement>;
  /** `pointer`: chosen with a mouse or a finger (a click with no detail is the keyboard). */
  onSelect: (line: number, pointer: boolean) => void;
}) {
  const sheet = variant === 'sheet';
  const first = headings[0]?.line;
  const level = (nodes: readonly OutlineNode[], depth: number): ReactNode => (
    <ol className={depth === 0 ? treeRootClassName : treeBranchClassName}>
      {nodes.map(({ heading, children }) => {
        const active = heading.line === activeLine;
        return (
          <li key={heading.line} className={treeNodeClassName}>
            <a
              ref={
                active || (activeLine === undefined && heading.line === first)
                  ? focusRef
                  : undefined
              }
              href={`#line-${heading.line}`}
              title={heading.text}
              aria-current={active ? 'location' : undefined}
              data-outline-depth={depth}
              className={cn(treeLinkItemClassName, sheet && 'py-1')}
              onClick={(event) => {
                event.preventDefault();
                onSelect(heading.line, event.detail > 0);
              }}
            >
              <span
                className={
                  sheet ? 'line-clamp-2 min-w-0 break-words' : treeItemLabelTruncateClassName
                }
              >
                {heading.text}
              </span>
            </a>
            {children.length > 0 && level(children, depth + 1)}
          </li>
        );
      })}
    </ol>
  );
  return level(outlineTree(headings), 0);
}

/**
 * The headings of the previewed document as a column of links, beside the text of a wide panel.
 * Narrower panels open the same list as a sheet (`DocumentOutlineSheet`).
 */
export function DocumentOutline({
  headings,
  activeLine,
  onSelect,
}: {
  headings: readonly OutlineHeading[];
  activeLine?: number;
  onSelect: (line: number, pointer: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t('documents.outline.label');
  return (
    <nav aria-label={label} className="min-w-0">
      <div className={treeSectionHeaderClassName}>
        <Typography as="p" variant="section-label" className="min-w-0 truncate text-content-muted">
          {label}
        </Typography>
      </div>
      <OutlineEntries
        headings={headings}
        activeLine={activeLine}
        variant="column"
        onSelect={onSelect}
      />
    </nav>
  );
}
