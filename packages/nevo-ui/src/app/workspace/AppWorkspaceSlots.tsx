import type { ReactNode } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../lib';
import { useAppWorkspace } from '../shell/AppShell';
import {
  resolveSlotMaxWidth,
  resolveWorkspaceSplit,
  type AppWorkspaceShare,
  type AppWorkspaceSplitMode,
} from './workspaceSizing';

export interface AppWorkspaceSlot {
  content: ReactNode;
}

export interface AppWorkspaceSlotsProps {
  primary: AppWorkspaceSlot;
  secondary?: AppWorkspaceSlot;
  split?: AppWorkspaceSplitMode;
}

function StaticWorkspaceSlotRegion({
  divider = false,
  share,
  slot,
  slotName,
}: {
  divider?: boolean;
  share: AppWorkspaceShare;
  slot: AppWorkspaceSlot;
  slotName: 'primary' | 'secondary';
}) {
  const { availableWidth } = useAppWorkspace();
  const width = resolveSlotMaxWidth(availableWidth, share);

  return (
    <div
      className={cn(
        'min-w-0 flex-none overflow-hidden',
        divider && 'border-l border-border-subtle',
      )}
      {...designSlot('AppWorkspaceSlots', slotName)}
      style={{
        width: width === undefined ? `${share}%` : `${width}px`,
      }}
    >
      {slot.content}
    </div>
  );
}

export function AppWorkspaceSlots({
  primary,
  secondary,
  split = 'balanced',
}: AppWorkspaceSlotsProps) {
  const { availableWidth } = useAppWorkspace();
  const resolvedSplit = resolveWorkspaceSplit(split, secondary !== undefined, availableWidth);
  const layout = secondary ? split : 'single';
  const capture = useDesignMetadata('AppWorkspaceSlots', { layout });

  return (
    <div
      className="flex h-full max-w-full items-stretch overflow-hidden"
      style={{
        width: availableWidth === undefined ? '100%' : `${availableWidth}px`,
      }}
      {...capture}
    >
      <StaticWorkspaceSlotRegion share={resolvedSplit.primary} slot={primary} slotName="primary" />
      {secondary ? (
        <StaticWorkspaceSlotRegion
          divider
          share={resolvedSplit.secondary}
          slot={secondary}
          slotName="secondary"
        />
      ) : null}
    </div>
  );
}
