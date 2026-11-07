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
  branchPreviewParts,
  createOverrides,
  effectiveSlug,
  readableBranchPreview,
  type BranchPreviewPart,
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

/**
 * The generated branch with the parts nobody knows before creation (the Specification key, the
 * random id, a slug before there is a name) written as words in their own quiet style, never as
 * template tokens; the full name wraps rather than hiding its end.
 */
function BranchPreview({ options, slug }: { options: CreateOptions; slug: string }) {
  const { t } = useTranslation();
  const parts = branchPreviewParts(options, slug);
  const pendingWord = (part: BranchPreviewPart & { kind: 'pending' }) =>
    t(`create.workspace.rows.pending.${part.part}`);

  return (
    <BranchRef
      title={readableBranchPreview(options, slug)}
      name={parts.map((part, index) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <span key={index} className="font-sans italic text-content-muted">
            {pendingWord(part)}
          </span>
        ),
      )}
    />
  );
}

/** What the pending parts of the preview mean, once each. */
function pendingNotes(options: CreateOptions, slug: string, t: TFunction): string[] {
  const pending = new Set(
    branchPreviewParts(options, slug).flatMap((part) =>
      part.kind === 'pending' ? [part.part] : [],
    ),
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
      <span id={labelId} className="text-body-sm text-content-secondary">
        {label}
      </span>
      <div className="order-last col-span-2 min-w-0 text-body-sm text-content-primary @md/git:order-none @md/git:col-span-1">
        {value}
      </div>
      <div className="col-start-2 row-start-1 justify-self-end @md/git:col-start-3">{action}</div>
      {detail ? (
        <div className="order-last col-span-2 mt-2 grid min-w-0 gap-4 @md/git:col-start-2">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The settings of a new workspace as three decision rows: Start from, Merge into and Branch name.
 * Each row shows the value Create will use and one action: "Change" replaces the value with its
 * field, "Use default" goes back. The actions use the transitions of `workspaceOverrides`, so an
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

  const action = (changed: boolean, onPress: () => void) => (
    <Button variant="ghost" size="sm" onClick={onPress}>
      {changed ? t('create.workspace.rows.useDefault') : t('create.workspace.rows.change')}
    </Button>
  );

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
              : action(choice.base.on, () => {
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
              : action(choice.target.on, () => {
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
              {overrides.branch ? (
                <BranchRef name={overrides.branch} />
              ) : (
                <BranchPreview options={options} slug={slug} />
              )}
              {overrides.branch
                ? null
                : pendingNotes(options, slug, t).map((note) => (
                    <span key={note}>{rowNote(note)}</span>
                  ))}
              {/* While changed, the branch field says it; otherwise the row does. */}
              {generatedProblem && !branchOpen
                ? rowNote(text(generatedProblem), 'attention')
                : null}
            </>
          }
          action={action(branchOpen, () => {
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
