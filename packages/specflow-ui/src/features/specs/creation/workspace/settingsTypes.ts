import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceChoice } from './model/workspaceChoice';

/** How a setting changes the choice: a patch of its own fields, or a full update of the choice. */
export interface SettingsUpdate {
  set: (patch: Partial<WorkspaceChoice>) => void;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
}

/** Focus a control once the render this event causes is done (its field may not exist yet). */
export type SettingsFocusRequest = (field: 'base' | 'target') => void;
