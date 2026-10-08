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
  settings: Settings,
  'log-out': LogOut,
} satisfies Record<IconName, LucideIcon>;

export const iconSizeClasses = {
  sm: 'size-icon-sm',
  md: 'size-icon-md',
} as const satisfies Record<IconSize, string>;

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
    registered ? { assetRef: iconAssetRef(name, size), assetRepresentation: 'svg-mask' } : undefined,
  );
  return (
    <Glyph
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : ariaLabel}
      className={cn('block shrink-0', iconSizeClasses[size], className)}
      focusable="false"
      strokeWidth="2"
      {...props}
      {...capture}
    />
  );
}
