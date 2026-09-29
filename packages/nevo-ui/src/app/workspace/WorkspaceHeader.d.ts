import { type ReactElement, type ReactNode } from 'react';
import { type IconName } from '../../components/foundations/Icon';
export type WorkspaceHeaderActionTone = 'neutral' | 'danger';
export type WorkspaceHeaderAction = {
    id: string;
    label: string;
    icon?: IconName;
    primary?: boolean;
    disabled?: boolean;
    tone?: WorkspaceHeaderActionTone;
    onPress: () => void;
};
export interface WorkspaceHeaderProps {
    actions?: readonly WorkspaceHeaderAction[];
    className?: string;
    icon?: IconName;
    status?: ReactNode;
    subtitle?: ReactNode;
    title: ReactNode;
}
export type ResolvedWorkspaceHeaderActions = {
    directPrimary?: WorkspaceHeaderAction;
    overflow: readonly WorkspaceHeaderAction[];
};
export declare function resolveWorkspaceHeaderActions(actions?: readonly WorkspaceHeaderAction[], compact?: boolean): ResolvedWorkspaceHeaderActions;
export declare function WorkspaceHeader({ actions, className, icon, status, subtitle, title, }: WorkspaceHeaderProps): import("react/jsx-runtime").JSX.Element;
export declare function isWorkspaceHeaderElement(node: ReactNode): node is ReactElement<WorkspaceHeaderProps, typeof WorkspaceHeader>;
export declare function getWorkspaceHeaderActions(node: ReactNode): readonly WorkspaceHeaderAction[];
export declare function CompactWorkspaceActions({ className, header, navigationAction, }: {
    className?: string;
    header: ReactNode;
    navigationAction?: WorkspaceHeaderAction;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=WorkspaceHeader.d.ts.map