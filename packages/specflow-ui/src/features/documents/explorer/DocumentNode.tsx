import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  treeAttentionGlyphClassName,
  treeAttentionStateLabelClassName,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRowClassName,
  treeTrailingLabelClassName,
} from '@nevo/ui';
import type { TrailingLabel } from '../catalogue/documentTypePolicy';

const lastSegment = (path: string) => path.split('/').at(-1) ?? path;

/**
 * One folder row: chevron, icon and name. `editor` replaces the row while it is being renamed;
 * `menu` is its actions; `children` are the nested rows when it is open.
 */
export function FolderNode({
  path,
  expanded,
  describedBy,
  buttonRef,
  editor,
  menu,
  onToggle,
  children,
}: {
  path: string;
  expanded: boolean;
  /** The quiet "empty folder" hint this open folder is described by. */
  describedBy?: string;
  buttonRef: (node: HTMLButtonElement | null) => void;
  editor?: ReactNode;
  menu: ReactNode;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const name = lastSegment(path);
  return (
    <li className={treeNodeClassName}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TruncatedTooltip name={name}>
              {(label) => (
                <button
                  type="button"
                  className={treeItemClassName}
                  ref={buttonRef}
                  aria-expanded={expanded}
                  aria-describedby={describedBy}
                  onClick={onToggle}
                >
                  <span className={treeGlyphSlotClassName}>
                    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
                  </span>
                  <Icon name="folder" />
                  <span ref={label} className={treeItemLabelTruncateClassName}>
                    {name}
                  </span>
                </button>
              )}
            </TruncatedTooltip>
            {menu}
          </>
        )}
      </div>
      {children}
    </li>
  );
}

/**
 * One document row: icon, name, the quiet trailing label and its actions. A dangling entry (the
 * registry lists a file that is not on disk) keeps its place with the warning glyph and
 * `File missing`. The label is part of the row button's text, so it is in its accessible name.
 */
export function DocumentNode({
  path,
  flat = false,
  label,
  selected,
  disabled,
  buttonRef,
  editor,
  menu,
  onOpen,
}: {
  path: string;
  /** In a level without folders: no offset to a folder icon column. */
  flat?: boolean;
  label?: TrailingLabel;
  /** The document that is open, nothing else. */
  selected: boolean;
  disabled: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  editor?: ReactNode;
  menu: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const name = lastSegment(path);
  const missing = label?.kind === 'missing';
  return (
    <li className={treeNodeClassName}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TruncatedTooltip name={name}>
              {(labelRef) => (
                <button
                  type="button"
                  disabled={disabled}
                  className={flat ? treeItemClassName : treeLeafItemClassName}
                  ref={buttonRef}
                  aria-current={selected ? 'true' : undefined}
                  onClick={onOpen}
                >
                  {missing ? (
                    <Icon name="triangle-alert" className={treeAttentionGlyphClassName} />
                  ) : (
                    <Icon name="file" />
                  )}
                  <span
                    ref={labelRef}
                    className={cn(treeItemLabelTruncateClassName, missing && 'text-content-muted')}
                  >
                    {name}
                  </span>
                  {label?.kind === 'type' && (
                    <span className={treeTrailingLabelClassName}>{label.text}</span>
                  )}
                  {missing && (
                    <span className={treeAttentionStateLabelClassName}>
                      {t('documents.tree.fileMissing')}
                    </span>
                  )}
                </button>
              )}
            </TruncatedTooltip>
            {menu}
          </>
        )}
      </div>
    </li>
  );
}

/** Shows the full name in a tooltip only when the single-line label is actually clipped. */
function TruncatedTooltip({
  name,
  children,
}: {
  name: string;
  children: (label: RefObject<HTMLSpanElement | null>) => ReactElement;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) =>
        setOpen(
          next && label.current !== null && label.current.scrollWidth > label.current.clientWidth,
        )
      }
    >
      <TooltipTrigger asChild>{children(label)}</TooltipTrigger>
      <TooltipContent className="break-all">{name}</TooltipContent>
    </Tooltip>
  );
}
