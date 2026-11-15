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
  treeStateLabelClassName,
} from '@nevo/ui';
import { useFlatLevel } from './TreeLevel';
import { TreeRowTooltip } from './TreeRowTooltip';
import type { TreeRowFocus } from './useRovingTree';

/** A trailing state the reader must always see (the name gives way to it, never the label). */
export interface TreeRowState {
  readonly text: string;
  /** Attention tone (for example a missing file): the leading glyph becomes the warning glyph. */
  readonly attention?: boolean;
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

function StateLabel({ state }: { state: TreeRowState }) {
  return (
    <span className={state.attention ? treeAttentionStateLabelClassName : treeStateLabelClassName}>
      {state.text}
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
  onOpen: () => void;
}) {
  const flat = useFlatLevel();
  const attention = state?.attention === true;
  // Beside folders a leading document starts like a folder: its glyph in the chevron column.
  const inChevronColumn = lead && !flat && !attention;

  return (
    <li className={cn(treeNodeClassName, lead && 'mb-2')}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TreeRowTooltip name={name} details={details}>
              {(label) => (
                <button
                  type="button"
                  disabled={disabled}
                  className={flat || inChevronColumn ? treeItemClassName : treeLeafItemClassName}
                  ref={buttonRef}
                  aria-current={current ? 'true' : undefined}
                  onClick={onOpen}
                  {...focus}
                >
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
                  {spokenDetail && <span className="sr-only">{spokenDetail}</span>}
                  {state && <StateLabel state={state} />}
                </button>
              )}
            </TreeRowTooltip>
            {menu}
          </>
        )}
      </div>
    </li>
  );
}
