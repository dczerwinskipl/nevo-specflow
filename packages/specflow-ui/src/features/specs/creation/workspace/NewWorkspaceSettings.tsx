import {
  useId,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Button, Typography, cn } from '@nevo/ui';
import { createControlWidth } from '../createFormLayout';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { refDisplayName, type CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import { BaseRefField } from './BaseRefField';
import { BranchRef } from './BranchRef';
import { BranchField } from './BranchField';
import { MergeTargetField } from './MergeTargetField';
import { SlugField } from './SlugField';
import { WorkspaceRef } from './WorkspaceRef';
import type { SettingsFocusRequest } from './settingsTypes';
import {
  branchNameParts,
  branchPreview,
  createOverrides,
  effectiveSlug,
} from './model/createRequest';
import { mergeUnavailableNote } from './model/workspaceCopy';
import {
  baseOverride,
  baseUnchangeable,
  branchNameChanged,
  branchNameOverride,
  targetOverride,
  targetUnchangeable,
} from './model/workspaceOverrides';
import { primaryWorkspace, targetStatus } from './model/workspaceTiles';
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

/** A quiet line under a row value: a caveat, or why the row cannot be changed. */
const rowNote = (children: ReactNode, tone: 'muted' | 'attention' = 'muted') => (
  <span
    className={
      tone === 'attention'
        ? 'mt-0.5 block text-body-sm text-status-attention'
        : 'mt-0.5 block text-body-sm text-content-muted'
    }
  >
    {children}
  </span>
);

/** The default merge target, as the row shows it while it is not changed. */
function mergeDefault(
  options: CreateOptions,
  t: TFunction,
  text: (message: Message) => string,
): { value: ReactNode; note?: ReactNode } {
  const status = targetStatus(options);
  switch (status.kind) {
    case 'ok':
      return { value: <WorkspaceRef workspace={status.workspace} /> };
    case 'unavailable':
      return {
        value: <WorkspaceRef workspace={status.workspace} />,
        note: text(mergeUnavailableNote(status.workspace.reason)),
      };
    case 'other-branch':
      return {
        value: t('create.workspace.merge.notAvailable'),
        note: status.primary?.branch ? (
          <Trans
            i18nKey="create.workspace.merge.noteOtherBranch"
            components={{
              target: <BranchRef name={status.branch} />,
              current: <BranchRef name={status.primary.branch} />,
            }}
          />
        ) : (
          <Trans
            i18nKey="create.workspace.merge.noteOtherBranchNone"
            components={{ target: <BranchRef name={status.branch} /> }}
          />
        ),
      };
    case 'none':
      return {
        value: t('create.workspace.merge.notConfigured'),
        note: t('create.workspace.merge.noteNoTarget'),
      };
  }
}

/** The default base, as the row shows it while it is not changed. */
function BaseDefault({ options }: { options: CreateOptions }) {
  const { t } = useTranslation();
  const primary = primaryWorkspace(options);
  if (options.defaultBaseRef === 'HEAD') {
    return primary?.branch ? (
      <BranchRef name={primary.branch} />
    ) : (
      <>{t('create.workspace.baseHead')}</>
    );
  }

  return <BranchRef name={refDisplayName(options.defaultBaseRef)} />;
}

/** What the pending parts of the preview mean, once each. */
function pendingNotes(name: string, t: TFunction): string[] {
  const pending = new Set(
    branchNameParts(name).flatMap((part) => (part.kind === 'pending' ? [part.part] : [])),
  );

  return (['key', 'id', 'slug'] as const)
    .filter((part) => pending.has(part))
    .map((part) => t(`create.workspace.rows.pendingNote.${part}`));
}

/**
 * One decision row: the label, the value (or, while it is changed, its field) and one quiet text
 * action. On a narrow container the label and the action share the first line and the value takes
 * the second. `detail` (the fields of a changed Branch name) sits under the value.
 */
function DecisionRow({
  label,
  value,
  action,
  detail,
}: {
  label: string;
  value: ReactNode;
  action?: ReactNode;
  detail?: ReactNode;
}) {
  const labelId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="col-span-2 grid grid-cols-subgrid items-baseline gap-y-1 @md/git:col-span-3"
    >
      {/* DOM order = the narrow reading order: label and action on the first line, then the value
          (or its field), then the details. Wide places the value between label and action; the
          action still comes before the field it opens in the Tab order. */}
      <span id={labelId} className="row-start-1 text-body-sm text-content-secondary">
        {label}
      </span>
      <div className="col-start-2 row-start-1 justify-self-end @md/git:col-start-3">{action}</div>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 text-body-sm text-content-primary @md/git:col-span-1 @md/git:col-start-2 @md/git:row-start-1">
        {value}
      </div>
      {detail ? (
        <div className="col-span-2 col-start-1 row-start-3 mt-2 grid min-w-0 gap-4 @md/git:col-start-2 @md/git:row-start-2">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The settings of a new workspace as three decision rows: Start from, Merge into and Branch name.
 * Each row shows the value Create will use and one action: "Change" replaces the value with its
 * field, "Restore default" goes back. The actions use the transitions of `workspaceOverrides`, so an
 * untouched or default-equal value is never sent. Under the rows, quietly: where the files are
 * committed (Git enabled) and the worktree folder.
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
  const text = useMessage();
  const ownRefs = {
    base: useRef<HTMLElement | null>(null),
    target: useRef<HTMLElement | null>(null),
    branch: useRef<HTMLInputElement | null>(null),
    slug: useRef<HTMLInputElement | null>(null),
  };
  const refs = controls ?? ownRefs;
  const set = (patch: Partial<WorkspaceChoice> | null) => {
    if (patch) {
      update((current) => ({ ...current, ...patch }));
    }
  };

  const settingsUpdate = { set, update };
  const fieldErrors = workspaceFieldErrors(choice, options, conflicts, title, errors);
  const overrides = createOverrides(choice, options, title);
  const slug = effectiveSlug(choice, title);
  const generatedProblem = generatedBranchProblem(choice, options, title);
  const branchOpen = branchNameChanged(choice);
  const merge = mergeDefault(options, t, text);

  const branchName = overrides.branch ?? branchPreview(options, slug);
  // The visible word plus the row, so each action has its own name that starts with what is seen.
  const action = (row: string, changed: boolean, onPress: () => void) => {
    const label = changed
      ? t('create.workspace.rows.useDefault')
      : t('create.workspace.rows.change');

    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('create.workspace.rows.actionLabel', { action: label, row })}
        onClick={onPress}
      >
        {label}
      </Button>
    );
  };

  return (
    <div className={cn('@container/git grid min-w-0 gap-3', createControlWidth)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 @md/git:grid-cols-[max-content_minmax(0,1fr)_auto]">
        <DecisionRow
          label={t('create.workspace.fact.base')}
          value={
            choice.base.on ? (
              <BaseRefField
                options={options}
                choice={choice}
                error={errors.base}
                update={settingsUpdate}
                controlRef={refs.base}
                onAnnounce={onAnnounce}
                onRequestFocus={onRequestFocus}
              />
            ) : (
              <>
                <BaseDefault options={options} />
                {baseUnchangeable(options, choice) &&
                  rowNote(t('create.workspace.settings.baseNone'))}
              </>
            )
          }
          action={
            baseUnchangeable(options, choice)
              ? undefined
              : action(t('create.workspace.fact.base'), choice.base.on, () => {
                  const on = !choice.base.on;
                  set(baseOverride(options, choice, on));
                  if (on) {
                    onRequestFocus('base');
                  }
                })
          }
        />
        <DecisionRow
          label={t('create.workspace.fact.target')}
          value={
            choice.target.on ? (
              <MergeTargetField
                options={options}
                choice={choice}
                error={errors.target}
                update={settingsUpdate}
                controlRef={refs.target}
              />
            ) : (
              <>
                {merge.value}
                {merge.note ? rowNote(merge.note) : null}
                {targetUnchangeable(options, choice) &&
                  rowNote(t('create.workspace.settings.targetNone'))}
              </>
            )
          }
          action={
            targetUnchangeable(options, choice)
              ? undefined
              : action(t('create.workspace.fact.target'), choice.target.on, () => {
                  const on = !choice.target.on;
                  set(targetOverride(options, choice, on));
                  if (on) {
                    onRequestFocus('target');
                  }
                })
          }
        />
        <DecisionRow
          label={t('create.workspace.fact.branch')}
          value={
            <>
              {/* The generated name writes its pending parts as words; it wraps, never hides its end. */}
              <BranchRef name={branchName} />
              {pendingNotes(branchName, t).map((note) => (
                <span key={note}>{rowNote(note)}</span>
              ))}
              {/* While changed, the branch field says it; otherwise the row does. */}
              {generatedProblem && !branchOpen
                ? rowNote(text(generatedProblem), 'attention')
                : null}
            </>
          }
          action={action(t('create.workspace.fact.branch'), branchOpen, () => {
            set(branchNameOverride(choice, !branchOpen));
            if (!branchOpen) {
              onRequestFocus('slug');
            }
          })}
          detail={
            branchOpen ? (
              <>
                <SlugField
                  choice={choice}
                  title={title}
                  error={fieldErrors.slug}
                  update={settingsUpdate}
                  inputRef={refs.slug}
                />
                <BranchField
                  options={options}
                  choice={choice}
                  title={title}
                  error={fieldErrors.branch}
                  update={settingsUpdate}
                  inputRef={refs.branch}
                />
              </>
            ) : undefined
          }
        />
      </div>
      <div className="grid min-w-0 gap-1 text-body-sm text-content-secondary">
        {options.commits ? <p className="m-0">{t('create.workspace.rows.commit')}</p> : null}
        <p className="m-0 flex min-w-0 gap-1">
          <span className="shrink-0">{t('create.workspace.rows.folder')}</span>
          <Typography
            as="span"
            variant="code-md"
            className="min-w-0 truncate"
            title={options.worktreesRoot.path}
          >
            {options.worktreesRoot.path}
          </Typography>
        </p>
        {options.worktreesRoot.exists ? null : (
          <p className="m-0">{t('create.workspace.folderWillBeCreated')}</p>
        )}
      </div>
    </div>
  );
}
