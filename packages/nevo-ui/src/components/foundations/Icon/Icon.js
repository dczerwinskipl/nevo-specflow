import { jsx as _jsx } from "react/jsx-runtime";
import { Archive, ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Clock3, Database, Ellipsis, Eye, EyeOff, FileText, Folder, GitBranch, Inbox, Info, LoaderCircle, ListChecks, Menu, MessageSquare, Minus, Plus, Search, Settings, SquareArrowOutUpRight, Trash2, TriangleAlert, Users, Workflow, X, } from 'lucide-react';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { iconAssetRef } from '../../../design-system/resources';
import { cn } from '../../../lib';
export const iconRegistry = {
    search: Search,
    plus: Plus,
    'arrow-right': ArrowRight,
    trash: Trash2,
    close: X,
    loader: LoaderCircle,
    file: FileText,
    branch: GitBranch,
    'chevron-right': ChevronRight,
    'chevron-down': ChevronDown,
    check: Check,
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
};
export const iconSizeClasses = {
    sm: 'size-icon-sm',
    md: 'size-icon-md',
};
export function Icon({ name, size = 'md', decorative = true, className, 'aria-label': ariaLabel, ...props }) {
    const Glyph = iconRegistry[name];
    const capture = useDesignMetadata('Icon', {}, {
        assetRef: iconAssetRef(name, size),
        assetRepresentation: 'svg-mask',
    });
    return (_jsx(Glyph, { "aria-hidden": decorative || undefined, "aria-label": decorative ? undefined : ariaLabel, className: cn('block shrink-0', iconSizeClasses[size], className), focusable: "false", strokeWidth: "2", ...props, ...capture }));
}
//# sourceMappingURL=Icon.js.map