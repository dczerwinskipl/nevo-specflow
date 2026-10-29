import type { SVGAttributes } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Database,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  FileSearch,
  Folder,
  GitBranch,
  Inbox,
  Info,
  LoaderCircle,
  List,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  SquareArrowOutUpRight,
  Trash2,
  TriangleAlert,
  Users,
  Workflow,
  X,
  Download,
  FolderInput,
  Pencil,
  PencilLine,
  Tag,
  Unlink,
  Upload,
  WrapText,
  ZoomIn,
  Link,
  Undo2,
  Image,
  FileDigit,
  ListFilter,
  BookOpen,
  Network,
  Server,
  ListOrdered,
  FileCheck,
  BookUser,
  PanelsTopLeft,
  type LucideIcon,
} from 'lucide-react';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import { iconAssetRef, type IconName, type IconSize } from '../../../design-system/resources';
import { cn } from '../../../lib';

export type { IconName, IconSize } from '../../../design-system/resources';

/** A curated DS name or any statically imported Lucide icon component. */
export type IconGlyph = IconName | LucideIcon;

export const iconRegistry = {
  search: Search,
  plus: Plus,
  refresh: RefreshCw,
  'arrow-right': ArrowRight,
  trash: Trash2,
  close: X,
  loader: LoaderCircle,
  file: FileText,
  'file-search': FileSearch,
  branch: GitBranch,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  check: Check,
  save: Save,
  inbox: Inbox,
  folder: Folder,
  archive: Archive,
  database: Database,
  calendar: CalendarDays,
  clock: Clock3,
  eye: Eye,
  'eye-off': EyeOff,
  menu: Menu,
  ellipsis: Ellipsis,
  chat: MessageSquare,
  'chat-plus': MessageSquarePlus,
  minimize: Minus,
  'open-full': SquareArrowOutUpRight,
  info: Info,
  'circle-check': CircleCheck,
  'triangle-alert': TriangleAlert,
  'circle-alert': CircleAlert,
  users: Users,
  workflow: Workflow,
  'list-checks': ListChecks,
  list: List,
  settings: Settings,
  'log-out': LogOut,
  // Actions on an item: the name says what the action does, not a state.
  edit: Pencil,
  rename: PencilLine,
  move: FolderInput,
  upload: Upload,
  download: Download,
  classify: Tag,
  unlink: Unlink,
  wrap: WrapText,
  'actual-size': ZoomIn,
  'show-path': Link,
  undo: Undo2,
  // Content formats of a file (an image, a file that is not text).
  image: Image,
  'file-binary': FileDigit,
  // Narrows a list to chosen values.
  filter: ListFilter,
  // Document types (the glyph a type definition names).
  'book-open': BookOpen,
  network: Network,
  server: Server,
  'list-ordered': ListOrdered,
  'file-check': FileCheck,
  'book-user': BookUser,
  'panels-top-left': PanelsTopLeft,
} satisfies Record<IconName, LucideIcon>;

/**
 * Whether `value` names a registered glyph: for icon names that come from data (for example a
 * definition file), so an unknown name falls back instead of failing.
 */
export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(iconRegistry, value);
}

export const iconSizeClasses = {
  sm: 'size-icon-sm',
  md: 'size-icon-md',
  lg: 'size-icon-lg',
  xl: 'size-icon-xl',
} as const satisfies Record<IconSize, string>;

/**
 * Stroke in the 24-unit glyph grid: control sizes keep the standard 2; illustration sizes use a
 * lighter line so a large glyph reads as a drawing rather than a heavy mark.
 */
const iconStrokeWidths = { sm: 2, md: 2, lg: 1.25, xl: 1 } as const satisfies Record<
  IconSize,
  number
>;

type IconAccessibilityProps =
  { decorative?: true; 'aria-label'?: never } | { decorative: false; 'aria-label': string };

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'children' | 'aria-label' | 'name'> &
  IconAccessibilityProps & {
    name: IconGlyph;
    size?: IconSize;
  };

export function Icon({
  name,
  size = 'md',
  decorative = true,
  className,
  'aria-label': ariaLabel,
  ...props
}: IconProps) {
  const registered = typeof name === 'string';
  const Glyph = registered ? iconRegistry[name] : name;
  // Custom Lucide icons are renderable, but only registered glyphs are Figma assets.
  const capture = useDesignMetadata(
    'Icon',
    {},
    registered
      ? { assetRef: iconAssetRef(name, size), assetRepresentation: 'svg-mask' }
      : undefined,
  );

  return (
    <Glyph
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : ariaLabel}
      className={cn('block shrink-0', iconSizeClasses[size], className)}
      focusable="false"
      strokeWidth={iconStrokeWidths[size]}
      {...props}
      {...capture}
    />
  );
}
