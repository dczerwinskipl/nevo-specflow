import type { WorkspaceUnavailableReason } from '@nevo/specflow-contracts/workspaces';
import { message, type Message } from '../../../i18n/message';

/**
 * Why a registered workspace cannot be used now (`WorkspaceList` `unavailableReason`), in the one
 * wording every screen listing workspaces shows (`workspaces.unavailable.*`).
 */
export const workspaceUnavailableMessage = (reason: WorkspaceUnavailableReason): Message =>
  message(`workspaces.unavailable.${reason}`);
