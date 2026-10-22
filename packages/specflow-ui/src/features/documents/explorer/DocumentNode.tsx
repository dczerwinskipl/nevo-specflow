import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRequiredLabelClassName,
  treeRequiredMarkerClassName,
  treeRowClassName,
} from '@nevo/ui';

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

/** One document row: icon, name, the required badge and its actions. */
export function DocumentNode({
  path,
  required,
  selected,
  disabled,
  buttonRef,
  editor,
  menu,
  onOpen,
}: {
  path: string;
  required: boolean;
  /** The document that is open, nothing else (never "required"). */
  selected: boolean;
  disabled: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  editor?: ReactNode;
  menu: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
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
                  disabled={disabled}
                  className={treeLeafItemClassName}
                  ref={buttonRef}
                  aria-current={selected ? 'true' : undefined}
                  onClick={onOpen}
                >
                  <Icon name="file" />
                  <span ref={label} className={treeItemLabelTruncateClassName}>
                    {name}
                  </span>
                  {required && (
                    <>
                      <span className={treeRequiredLabelClassName}>
                        {t('documents.tree.required')}
                      </span>
                      <span aria-hidden className={treeRequiredMarkerClassName}>
                        <Icon name="workflow" size="sm" />
                      </span>
                    </>
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
