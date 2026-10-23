import type { CreateOptions } from '@nevo/specflow-contracts/specs';

/**
 * Pure policy of the "Where do you want to work?" section: which tiles are available, what the
 * request carries, and which stale values must be flagged. A switched-on setting starts from the
 * effective default (so the owner only adjusts), but only a value that differs from that default is
 * ever sent: the UI forwards a real override or nothing.
 */
/** What the workspace section draws: the options are loading, unreadable, not allowed, or ready. */
export type WorkspaceOptionsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  | { status: 'ready'; options: CreateOptions };

export type Tile = 'new' | 'main' | 'existing';

export interface WorkspaceChoice {
  /** `null` = untouched: the tile follows {@link defaultTile} until the user picks one. */
  tile: Tile | null;
  base: { on: boolean; ref: string };
  target: { on: boolean; workspaceId: string };
  /** `edited`: the owner typed a name; until then the field shows the generated default. */
  branch: { on: boolean; name: string; edited: boolean };
  /** `edited`: the owner typed a slug; until then the field follows the title. */
  slug: { on: boolean; value: string; edited: boolean };
  existingWorkspaceId: string;
  settingsOpen: boolean;
  /** Merge-back suggestions the user declined, per workspace id. */
  dismissedSuggestions: Record<string, true>;
}

export const initialWorkspaceChoice: WorkspaceChoice = {
  tile: null,
  base: { on: false, ref: '' },
  target: { on: false, workspaceId: '' },
  branch: { on: false, name: '', edited: false },
  slug: { on: false, value: '', edited: false },
  existingWorkspaceId: '',
  settingsOpen: false,
  dismissedSuggestions: {},
};

/**
 * The request-relevant part of the choice. UI-only state (`settingsOpen`, declined suggestions)
 * is deliberately absent: opening the disclosure is neither an edit nor a reason to retire a
 * failure alert or to ask for a leave confirmation.
 */
export function requestChoiceSnapshot(choice: WorkspaceChoice) {
  return {
    tile: choice.tile,
    base: choice.base,
    target: choice.target,
    branch: choice.branch,
    slug: choice.slug,
    existingWorkspaceId: choice.existingWorkspaceId,
  };
}
