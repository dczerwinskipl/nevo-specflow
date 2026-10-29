import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Collapsible } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { BaseRefSetting } from './BaseRefSetting';
import { BranchSetting } from './BranchSetting';
import { MergeTargetSetting } from './MergeTargetSetting';
import { SlugSetting } from './SlugSetting';
import type { SettingsFocusRequest } from './settingsTypes';
import {
  generatedBranchProblem,
  workspaceFieldErrors,
  type WorkspaceErrors,
} from './model/workspaceValidation';
import type { WorkspaceChoice } from './model/workspaceChoice';
import type { WorkspaceConflicts } from './model/workspaceConflicts';

/** Focusable controls of the settings, so an owner can focus an invalid one without DOM queries. */
export interface WorkspaceSettingsControls {
  base: MutableRefObject<HTMLElement | null>;
  target: MutableRefObject<HTMLElement | null>;
  branch: MutableRefObject<HTMLInputElement | null>;
  slug: MutableRefObject<HTMLInputElement | null>;
}

/**
 * "Change settings": one collapsed disclosure that composes four independent settings (base,
 * merge target, name, branch), each owning its switch and field. Off means the field is absent from
 * the request; on means exactly the chosen value. Values survive toggling.
 */
export function NewWorkspaceSettings({
  options,
  choice,
  update,
  errors,
  conflicts,
  title,
  onAnnounce,
  controls,
  onRequestFocus,
}: {
  options: CreateOptions;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  errors: WorkspaceErrors;
  /** What the server refused about the typed branch or slug; shown at the field until it is edited. */
  conflicts?: WorkspaceConflicts;
  /** The specification name: the generated slug and branch preview derive from it. */
  title: string;
  onAnnounce: (message: string) => void;
  /** Owner-held refs; defaults to refs private to the settings. */
  controls?: WorkspaceSettingsControls;
  /** Focus a control once the render this event causes is done (its field may not exist yet). */
  onRequestFocus: SettingsFocusRequest;
}) {
  const { t } = useTranslation();
  const ownRefs = {
    base: useRef<HTMLElement | null>(null),
    target: useRef<HTMLElement | null>(null),
    branch: useRef<HTMLInputElement | null>(null),
    slug: useRef<HTMLInputElement | null>(null),
  };
  const refs = controls ?? ownRefs;
  const set = (patch: Partial<WorkspaceChoice>) => update((current) => ({ ...current, ...patch }));
  const settingsUpdate = { set, update };
  const fieldErrors = workspaceFieldErrors(choice, options, conflicts, title, errors);

  // A value the (refreshed) options invalidated sits in this panel: keep it open so the flagged
  // field is visible instead of a silently blocked Create.
  const flagged = Boolean(
    errors.base ??
    errors.target ??
    errors.slug ??
    errors.branch ??
    generatedBranchProblem(choice, options, title),
  );

  // The flag is what keeps the panel open, and typing the fix clears it. Without remembering the
  // panel as open, it would collapse (and hide the field) mid-keystroke, dropping the rest of the
  // typed name. Once flagged, the panel stays open until the owner closes it.
  useEffect(() => {
    if (flagged && !choice.settingsOpen) {
      set({ settingsOpen: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` only wraps the stable `update`.
  }, [flagged, choice.settingsOpen]);

  return (
    <Collapsible
      className="col-start-2 -ml-control-padding-compact"
      isExpanded={choice.settingsOpen || flagged}
      onExpandedChange={(open) => set({ settingsOpen: open })}
    >
      <Collapsible.Trigger className="w-full">
        {t('create.workspace.settings.trigger')}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="grid grid-cols-1 divide-y divide-border-subtle">
          {/* The first switch needs 12px above it inside the clipping panel for its 44px touch target. */}
          <BaseRefSetting
            options={options}
            choice={choice}
            error={errors.base}
            update={settingsUpdate}
            controlRef={refs.base}
            onAnnounce={onAnnounce}
            onRequestFocus={onRequestFocus}
          />
          <MergeTargetSetting
            options={options}
            choice={choice}
            error={errors.target}
            update={settingsUpdate}
            controlRef={refs.target}
          />
          <SlugSetting
            choice={choice}
            title={title}
            error={fieldErrors.slug}
            update={settingsUpdate}
            inputRef={refs.slug}
          />
          <BranchSetting
            options={options}
            choice={choice}
            title={title}
            error={fieldErrors.branch}
            update={settingsUpdate}
            inputRef={refs.branch}
          />
        </div>
      </Collapsible.Content>
    </Collapsible>
  );
}
