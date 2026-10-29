import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  type IconName,
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
 * One document row: one glyph slot, the name and its actions. The glyph is the file's format
 * (`documentRowGlyph`); the type is in the row's tooltip (hover and keyboard focus) and in its
 * accessible name, and on touch in the row menu and the document header. The main file (the
 * protected overview) has a slightly stronger name. A dangling entry (the registry lists a file
 * that is not on disk) keeps its place with the warning glyph and `File missing`.
 */
export function DocumentNode({
  path,
  flat = false,
  glyph = 'file',
  main = false,
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
  /** The glyph slot (a registry icon); a missing file always shows the warning glyph. */
  glyph?: IconName;
  /** The specification's main file: a slightly stronger name, no badge. */
  main?: boolean;
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
  const type = label?.kind === 'type' ? label.text : undefined;
  // The tooltip says it as the row menu does ("Type: UX").
  const typeLine = type ? t('documents.tree.typeOf', { type }) : undefined;
  return (
    <li className={treeNodeClassName}>
      <div className={treeRowClassName}>
        {editor ?? (
          <>
            <TruncatedTooltip name={name} detail={typeLine}>
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
                    <Icon name={glyph} />
                  )}
                  <span
                    ref={labelRef}
                    className={cn(
                      treeItemLabelTruncateClassName,
                      missing && 'text-content-muted',
                      main && 'font-medium',
                    )}
                  >
                    {name}
                  </span>
                  {/* The type is read with the name; sighted users get it from the tooltip. */}
                  {type && <span className="sr-only">{type}</span>}
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

/**
 * The row's tooltip, on hover and on keyboard focus: the full name when the single-line label is
 * clipped, and the `detail` (the document's type) whenever there is one.
 */
function TruncatedTooltip({
  name,
  detail,
  children,
}: {
  name: string;
  detail?: string;
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
        setOpen(next && (isClipped || detail !== undefined));
      }}
    >
      <TooltipTrigger asChild>{children(label)}</TooltipTrigger>
      <TooltipContent className="break-all">
        {clipped && <span className="block">{name}</span>}
        {detail && <span className={clipped ? 'block text-content-muted' : 'block'}>{detail}</span>}
        {!clipped && !detail && name}
      </TooltipContent>
    </Tooltip>
  );
}
