import { type ReactNode } from 'react';
import { type AppWorkspaceSplitMode } from './workspaceSizing';
import { WorkspaceHeader, type WorkspaceHeaderAction, type WorkspaceHeaderActionTone, type WorkspaceHeaderProps } from './WorkspaceHeader';
import './AppWorkspace.css';
export interface AppWorkspaceLabels {
    backToPrimary: string;
    closeSecondary: string;
    openNavigation: string;
}
export interface AppWorkspaceRegionProps {
    header?: ReactNode;
    children: ReactNode;
}
type CommonAppWorkspaceProps = {
    split?: AppWorkspaceSplitMode;
    labels?: Partial<AppWorkspaceLabels>;
};
export type AppWorkspaceProps = CommonAppWorkspaceProps & {
    children: ReactNode;
};
declare function AppWorkspacePrimary(_props: AppWorkspaceRegionProps): null;
declare function AppWorkspaceSecondary(_props: AppWorkspaceRegionProps): null;
declare function AppWorkspaceRoot({ children, labels: labelsProp, split }: AppWorkspaceProps): import("react/jsx-runtime").JSX.Element;
export declare const AppWorkspace: typeof AppWorkspaceRoot & {
    Primary: typeof AppWorkspacePrimary;
    Secondary: typeof AppWorkspaceSecondary;
};
export { WorkspaceHeader, type WorkspaceHeaderAction, type WorkspaceHeaderActionTone, type WorkspaceHeaderProps, };
export { AppContent, AppContentContainer, AppWorkspaceBody, AppWorkspaceHeader, type AppContentContainerProps, type AppContentContainerSize, } from './AppContent';
export { AppWorkspaceSlots, type AppWorkspaceSlot, type AppWorkspaceSlotsProps, } from './AppWorkspaceSlots';
//# sourceMappingURL=AppWorkspace.d.ts.map