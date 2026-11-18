import type { ReactNode, Ref } from 'react';
import {
  Icon,
  type IconName,
  cn,
  treeAttentionGlyphClassName,
  treeAttentionStateLabelClassName,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRowClassName,
  treeSecondaryStateLabelClassName,
  treeStateLabelClassName,
  treeStaticItemClassName,
} from '@nevo/ui';
import { useFlatLevel } from './TreeLevel';
import { TreeRowTooltip } from './TreeRowTooltip';
import type { TreeRowFocus } from './useRovingTree';

/** A trailing state the reader must always see (the name gives way to it, never the label). */
export interface TreeRowState {
  readonly text: string;
  /**
   * The row itself needs attention (for example a missing file): the leading glyph becomes the
   * warning glyph and the label takes the attention tone.
   */
  readonly attention?: boolean;
  /**
   * The label's tone when the row is not in attention: `muted` (default, a standing fact such as
   * "Required"), `secondary` (a relation to the work at hand, such as "needed to finish this
   * step") or `attention` (the label with its warning icon; the row's glyph stays).
   */
  readonly tone?: 'muted' | 'secondary' | 'attention';
  /** The label in a narrow row (below `@md` row width), for example without a step title. */
  readonly shortText?: string;
  /**
   * The name keeps its width and, only when both do not fit on one line, the label goes to its own
   * line (right-aligned, wrapping over more lines when it needs them; never cut), instead of the
   * name giving way. For a long label that must keep all of its words, such as a step title.
   */
  readonly wrap?: boolean;
}

/** What every row takes beyond its own content: focus wiring, the edit entry and the actions. */
interface TreeRowSlots {
  buttonRef?: Ref<HTMLButtonElement>;
  /** The roving Tab stop of a keyboard-driven tree (`useRovingTree`). */
  focus?: TreeRowFocus;
  /** Replaces the row while it is being edited (an inline rename). */
  editor?: ReactNode;
  /** The row's actions, a sibling of the row button. */
  menu?: ReactNode;
}

const stateLabelClassName = {
  muted: treeStateLabelClassName,
  secondary: treeSecondaryStateLabelClassName,
  attention: treeAttentionStateLabelClassName,
} as const;

/**
 * A wrapping label on its own line keeps every word: it wraps over more lines, right-aligned,
 * instead of the one fixed-height, unbroken line of a trailing label.
 */
function onOwnLine(className: string): string {
  return [
    ...className
      .split(' ')
      .filter((name) => !['h-icon-md', 'items-center', 'whitespace-nowrap'].includes(name)),
    'ml-auto min-w-0 max-w-[calc(100%-var(--spacing-tree-leaf-offset))] items-start text-right',
  ].join(' ');
}

function StateLabel({ state }: { state: TreeRowState }) {
  const tone = state.attention ? 'attention' : (state.tone ?? 'muted');

  return (
    <span
      className={cn(
        state.wrap ? onOwnLine(stateLabelClassName[tone]) : stateLabelClassName[tone],
        'gap-1',
      )}
    >
      {/* A row in attention carries the warning glyph in front; a label in attention its own. */}
      {tone === 'attention' && !state.attention ? (
        <span className="flex h-[1lh] shrink-0 items-center">
          <Icon name="triangle-alert" size="sm" className="shrink-0" />
        </span>
      ) : null}
      {state.shortText ? (
        <>
          <span className="@max-md/tree-row:hidden">{state.text}</span>
          <span className="hidden @max-md/tree-row:inline">{state.shortText}</span>
        </>
      ) : state.wrap ? (
        <span className="min-w-0">{state.text}</span>
      ) : (
        state.text
      )}
    </span>
  );
}

/**
 * One folder row: chevron, folder icon and the name on one line; a trailing state label (for
 * example "Proposals"); `children` are its nested level (or hint) while it is open.
 */
export function TreeFolderRow({
  name,
  expanded,
  state,
  describedBy,
  onToggle,
  children,
  buttonRef,
  focus,
  editor,
  menu,
}: TreeRowSlots & {
  name: string;
  expanded: boolean;
  state?: TreeRowState;
  /** The quiet hint this open folder is described by (an empty folder). */
  describedBy?: string;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <li className={treeNodeClassName}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TreeRowTooltip name={name}>
              {(label) => (
                <button
                  type="button"
                  className={treeItemClassName}
                  ref={buttonRef}
                  aria-expanded={expanded}
                  aria-describedby={describedBy}
                  onClick={onToggle}
                  {...focus}
                >
                  <span className={treeGlyphSlotClassName}>
                    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
                  </span>
                  <Icon name="folder" />
                  <span ref={label} className={treeItemLabelTruncateClassName}>
                    {name}
                  </span>
                  {state && <StateLabel state={state} />}
                </button>
              )}
            </TreeRowTooltip>
            {menu}
          </>
        )}
      </div>
      {children}
    </li>
  );
}

/**
 * One document row: one glyph and the name. Its icon lines up with the sibling folders' icons (in a
 * flat level it starts at the row edge). The name is one line with the full name in the tooltip when
 * clipped, or wraps (`wrap`, for long titles); the glyph stays on the first line either way.
 * `lead`: the document that leads its level above the folders (a specification's main file): a
 * slightly stronger name, its glyph in the folders' chevron column and a little room below it.
 * Without `onOpen` the row opens nothing (for example a context entry naming a code path): the same
 * line, not a button.
 */
export function TreeDocumentRow({
  name,
  wrap = false,
  glyph = 'file',
  lead = false,
  state,
  details = [],
  spokenDetail,
  current,
  disabled,
  onOpen,
  focusKey,
  buttonRef,
  focus,
  editor,
  menu,
}: TreeRowSlots & {
  name: string;
  wrap?: boolean;
  glyph?: IconName;
  lead?: boolean;
  state?: TreeRowState;
  /** Tooltip lines (hover and keyboard focus) after the name. */
  details?: readonly string[];
  /** Read with the name; sighted users get it from the tooltip. */
  spokenDetail?: string;
  /** The document that is open, nothing else. */
  current: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  /** A stable identity (`data-focus-key`), so a host that remounts the row finds its focus again. */
  focusKey?: string;
}) {
  const flat = useFlatLevel();
  const attention = state?.attention === true;
  // The label may take its own line: glyph and name stay together on the first one.
  const wrapping = state?.wrap === true;
  // Beside folders a leading document starts like a folder: its glyph in the chevron column.
  const inChevronColumn = lead && !flat && !attention;

  return (
    <li className={cn(treeNodeClassName, lead && 'mb-2')} data-focus-key={focusKey}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TreeRowTooltip name={name} details={details}>
              {(label) => {
                const leading = (
                  <>
                    {attention ? (
                      <Icon name="triangle-alert" className={treeAttentionGlyphClassName} />
                    ) : inChevronColumn ? (
                      <span className={treeGlyphSlotClassName}>
                        <Icon name={glyph} />
                      </span>
                    ) : (
                      <Icon name={glyph} />
                    )}
                    <span
                      ref={label}
                      className={cn(
                        wrap ? treeItemLabelClassName : treeItemLabelTruncateClassName,
                        attention && 'text-content-muted',
                        lead && 'font-medium',
                      )}
                    >
                      {name}
                    </span>
                  </>
                );
                const content = (
                  <>
                    {wrapping ? (
                      <span className="flex min-w-0 max-w-full shrink-0 items-start gap-tree-gap">
                        {leading}
                      </span>
                    ) : (
                      leading
                    )}
                    {spokenDetail && <span className="sr-only">{spokenDetail}</span>}
                    {state && <StateLabel state={state} />}
                  </>
                );

                return onOpen ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      flat || inChevronColumn ? treeItemClassName : treeLeafItemClassName,
                      wrapping && 'flex-wrap',
                    )}
                    ref={buttonRef}
                    aria-current={current ? 'true' : undefined}
                    onClick={onOpen}
                    {...focus}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    className={cn(
                      treeStaticItemClassName,
                      !flat && 'ml-tree-leaf-offset',
                      wrapping && 'flex-wrap',
                    )}
                  >
                    {content}
                  </div>
                );
              }}
            </TreeRowTooltip>
            {menu}
          </>
        )}
      </div>
    </li>
  );
}
