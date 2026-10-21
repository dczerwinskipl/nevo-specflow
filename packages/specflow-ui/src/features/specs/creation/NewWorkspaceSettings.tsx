import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  Alert,
  Button,
  Collapsible,
  Field,
  Icon,
  SwitchField,
  TextInput,
  Typography,
} from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import { useMessage } from '../../../i18n/message';
import { OptionSelect } from '../../../shared/controls/OptionSelect';
import type { DemoCreateOptions } from '@nevo/specflow-contracts/demo';
import { BranchRef } from './BranchRef';
import {
  branchFieldValue,
  branchPreview,
  defaultBaseValue,
  defaultTargetWorkspaceId,
  derivedSlug,
  effectiveSlug,
  effectiveTargetBranch,
  initialWorkspaceChoice,
  slugError,
  mergeSuggestion,
  noBranchLabel,
  reasonText,
  reasonTextInline,
  specCountLabel,
  type WorkspaceChoice,
  type WorkspaceErrors,
} from './workspaceChoice';

type FocusTarget = 'base' | 'target' | 'branch' | 'slug';

/** Focusable controls of the settings, so an owner can focus an invalid one without DOM queries. */
export interface WorkspaceSettingsControls {
  base: MutableRefObject<HTMLElement | null>;
  target: MutableRefObject<HTMLElement | null>;
  branch: MutableRefObject<HTMLInputElement | null>;
  slug: MutableRefObject<HTMLInputElement | null>;
}

/** Names a workspace by its branch; a workspace without one has no value to show. */
export function WorkspaceLabel({
  workspace,
  truncate = false,
}: {
  workspace: DemoCreateOptions['workspaces'][number];
  /** One line with an ellipsis (Select); the searchable list wraps so similar names stay distinct. */
  truncate?: boolean;
}) {
  const text = useMessage();
  return workspace.branch ? (
    <BranchRef name={workspace.branch} truncate={truncate} />
  ) : (
    <span className={truncate ? 'truncate' : undefined}>{text(noBranchLabel)}</span>
  );
}

/**
 * A workspace as a merge target: its name (the checkout folder) as the primary text and its branch as the secondary chip.
 */
export function WorkspaceRef({
  workspace,
  truncate = false,
}: {
  workspace: DemoCreateOptions['workspaces'][number];
  truncate?: boolean;
}) {
  const text = useMessage();
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={truncate ? 'truncate' : undefined}>{workspace.name}</span>{' '}
      {workspace.branch ? (
        <BranchRef name={workspace.branch} truncate={truncate} />
      ) : (
        <span className="text-content-muted">{text(noBranchLabel)}</span>
      )}
    </span>
  );
}

/**
 * "Zmień ustawienia": one collapsed disclosure with three independent switches. Off means the
 * field is absent from the request; on means exactly the chosen value. Values survive toggling.
 */
export function NewWorkspaceSettings({
  options,
  choice,
  update,
  errors,
  branchConflict,
  focusBranchSignal = 0,
  title,
  slugConflict,
  focusSlugSignal = 0,
  onAnnounce,
  controls,
}: {
  options: DemoCreateOptions;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  errors: WorkspaceErrors;
  /** Branch name the server reported as taken; shown as the field error until it is edited. */
  branchConflict?: string;
  focusBranchSignal?: number;
  /** The specification name: the generated slug and branch preview derive from it. */
  title: string;
  /** Slug the server reported as taken; shown as the field error until it is edited. */
  slugConflict?: string;
  focusSlugSignal?: number;
  onAnnounce: (message: string) => void;
  /** Owner-held refs; defaults to refs private to the settings. */
  controls?: WorkspaceSettingsControls;
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
  const pendingFocus = useRef<FocusTarget | null>(null);
  const seenSignal = useRef(0);
  const seenSlugSignal = useRef(0);
  useEffect(() => {
    if (focusBranchSignal > seenSignal.current) {
      seenSignal.current = focusBranchSignal;
      pendingFocus.current = 'branch';
    }
    if (focusSlugSignal > seenSlugSignal.current) {
      seenSlugSignal.current = focusSlugSignal;
      pendingFocus.current = 'slug';
    }
    const next = pendingFocus.current;
    if (!next) return;
    const element = refs[next].current;
    if (element) {
      element.focus();
      pendingFocus.current = null;
    }
  });

  const set = (patch: Partial<WorkspaceChoice>) => update((current) => ({ ...current, ...patch }));
  const primary = options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);
  const targets = options.workspaces;
  const selectableTargets = targets.filter((w) => w.integrationSelectable === true);
  const unavailableTargets = targets.filter((w) => w.integrationSelectable !== true);
  const suggestion = mergeSuggestion(choice, options);
  const currentTarget = effectiveTargetBranch(choice, options);

  const baseUnavailable = options.baseRefs.length === 0;
  const targetUnavailable = selectableTargets.length === 0;
  const branchError =
    errors.branch && choice.branch.name.trim()
      ? text(errors.branch)
      : branchConflict && choice.branch.edited && choice.branch.name.trim() === branchConflict
        ? t('create.workspace.errors.branchExists')
        : undefined;
  const slugValue = choice.slug.edited ? choice.slug.value : derivedSlug(title);
  const typedSlugError = choice.slug.edited ? slugError(choice.slug.value) : undefined;
  const slugErrorText = typedSlugError
    ? text(typedSlugError)
    : slugConflict && choice.slug.edited && choice.slug.value === slugConflict
      ? t('create.workspace.errors.slugTaken')
      : undefined;
  const branchValue = branchFieldValue(choice, options, title);
  const baseRefMeta = (ref: string, checkedOutWorkspaceId?: string) => {
    if (!checkedOutWorkspaceId) return undefined;
    const workspace = options.workspaces.find((w) => w.workspaceId === checkedOutWorkspaceId);
    if (!ref) return undefined;
    const label =
      checkedOutWorkspaceId === primary?.workspaceId
        ? t('create.workspace.settings.refCurrent')
        : t('create.workspace.settings.refWorkspace');
    return workspace?.state === 'dirty'
      ? t('create.workspace.settings.refDirty', { label })
      : label;
  };

  return (
    <Collapsible
      className="col-start-2 -ml-control-padding-compact"
      isExpanded={choice.settingsOpen}
      onExpandedChange={(open) => set({ settingsOpen: open })}
    >
      <Collapsible.Trigger className="w-full">
        {t('create.workspace.settings.trigger')}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="grid grid-cols-1 divide-y divide-border-subtle">
          {/* The first switch needs 12px above it inside the clipping panel for its 44px touch target. */}
          <div className="grid grid-cols-1 gap-3 py-3 first:pt-2">
            <SwitchField
              label={t('create.workspace.settings.baseSwitch')}
              checked={choice.base.on}
              aria-disabled={baseUnavailable && !choice.base.on ? true : undefined}
              fieldClassName={baseUnavailable && !choice.base.on ? 'opacity-60' : undefined}
              description={
                baseUnavailable ? (
                  t('create.workspace.settings.baseNone')
                ) : options.defaultBaseRef === 'HEAD' ? (
                  primary?.branch ? (
                    <Trans
                      i18nKey="create.workspace.baseHeadOnBranch"
                      components={{ branch: <BranchRef name={primary.branch} /> }}
                    />
                  ) : (
                    t('create.workspace.baseHead')
                  )
                ) : (
                  <Trans
                    i18nKey="create.workspace.settings.baseDefault"
                    components={{ branch: <BranchRef name={options.defaultBaseRef} /> }}
                  />
                )
              }
              onCheckedChange={(on) => {
                if (baseUnavailable && on) return;
                // On starts from the effective default (never an empty select, F-08); off restores it.
                set({ base: { on, ref: on ? defaultBaseValue(options) : '' } });
              }}
            />
            {choice.base.on && (
              <Field invalid={Boolean(errors.base)}>
                <Field.Label>{t('create.workspace.fact.base')}</Field.Label>
                <OptionSelect
                  value={choice.base.ref}
                  invalid={Boolean(errors.base)}
                  placeholder={t('create.workspace.settings.basePlaceholder')}
                  controlRef={refs.base}
                  onValueChange={(ref) => set({ base: { on: true, ref } })}
                  items={options.baseRefs.map((item) => ({
                    value: item.ref,
                    textValue: item.ref,
                    meta: baseRefMeta(item.ref, item.checkedOutWorkspaceId),
                    label: (wraps) => <BranchRef name={item.ref} truncate={!wraps} />,
                  }))}
                />
                {errors.base && <Field.Error>{text(errors.base)}</Field.Error>}
              </Field>
            )}
            {choice.base.on && suggestion?.kind === 'offer' && (
              <Alert
                tone="info"
                title={
                  <Trans
                    i18nKey="create.workspace.suggestion.title"
                    components={{ branch: <BranchRef name={suggestion.branch} /> }}
                  />
                }
              >
                <p>
                  {currentTarget ? (
                    <Trans
                      i18nKey="create.workspace.suggestion.projectDefault"
                      components={{ branch: <BranchRef name={currentTarget} /> }}
                    />
                  ) : null}
                  {t('create.workspace.suggestion.note')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      pendingFocus.current = 'target';
                      update((current) => ({
                        ...current,
                        settingsOpen: true,
                        target: { on: true, workspaceId: suggestion.workspaceId },
                      }));
                      onAnnounce(
                        t('create.workspace.suggestion.announceSet', {
                          branch: suggestion.branch,
                        }),
                      );
                    }}
                  >
                    {t('create.workspace.suggestion.set')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      pendingFocus.current = 'base';
                      update((current) => ({
                        ...current,
                        dismissedSuggestions: {
                          ...current.dismissedSuggestions,
                          [suggestion.workspaceId]: true,
                        },
                      }));
                      onAnnounce(
                        currentTarget
                          ? t('create.workspace.suggestion.announceKept', {
                              branch: currentTarget,
                            })
                          : t('create.workspace.suggestion.announceKeptNoTarget'),
                      );
                    }}
                  >
                    {t('create.workspace.suggestion.keep')}
                  </Button>
                </div>
              </Alert>
            )}
            {choice.base.on && suggestion?.kind === 'dirty' && (
              <Typography
                as="p"
                variant="body-sm"
                className="flex items-start gap-2 text-content-secondary"
              >
                <Icon name="info" size="sm" className="mt-0.5 shrink-0 text-content-muted" />
                <span className="min-w-0">
                  <Trans
                    i18nKey="create.workspace.suggestion.dirty"
                    components={{ branch: <BranchRef name={suggestion.branch} /> }}
                  />
                </span>
              </Typography>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 py-3">
            <SwitchField
              label={t('create.workspace.settings.targetSwitch')}
              checked={choice.target.on}
              aria-disabled={targetUnavailable && !choice.target.on ? true : undefined}
              fieldClassName={targetUnavailable && !choice.target.on ? 'opacity-60' : undefined}
              description={
                choice.target.on ? (
                  t('create.workspace.settings.targetPick')
                ) : targetUnavailable ? (
                  t('create.workspace.settings.targetNone')
                ) : options.integrationTargetBranch ? (
                  <Trans
                    i18nKey="create.workspace.settings.targetFollows"
                    components={{ branch: <BranchRef name={options.integrationTargetBranch} /> }}
                  />
                ) : (
                  t('create.workspace.settings.targetUnconfigured')
                )
              }
              onCheckedChange={(on) => {
                if (targetUnavailable && on) return;
                // On starts from the default target workspace; it is sent only once it differs.
                set({ target: { on, workspaceId: on ? defaultTargetWorkspaceId(options) : '' } });
              }}
            />
            {choice.target.on && (
              <Field invalid={Boolean(errors.target)}>
                <Field.Label>{t('create.workspace.settings.targetLabel')}</Field.Label>
                <OptionSelect
                  value={choice.target.workspaceId}
                  invalid={Boolean(errors.target)}
                  placeholder={t('create.workspace.existing.placeholder')}
                  controlRef={refs.target}
                  onValueChange={(workspaceId) => set({ target: { on: true, workspaceId } })}
                  items={targets.map((workspace) => {
                    const blocked = workspace.integrationSelectable !== true;
                    return {
                      value: workspace.workspaceId,
                      textValue: `${workspace.name} ${workspace.branch ?? text(noBranchLabel)}`,
                      unavailable: blocked,
                      description: blocked ? text(reasonText(workspace.reason)) : undefined,
                      meta: text(specCountLabel(workspace.specCount)),
                      label: (wraps) => <WorkspaceRef workspace={workspace} truncate={!wraps} />,
                    };
                  })}
                />
                <Field.Description>
                  {t('create.workspace.settings.targetNote')}
                  {unavailableTargets.length > 0 && (
                    <span className="mt-1 block">
                      {t('create.workspace.settings.targetUnavailable')}{' '}
                      {unavailableTargets.map((workspace, index) => (
                        <span key={workspace.workspaceId}>
                          {index > 0 ? ', ' : ''}
                          <WorkspaceRef workspace={workspace} />{' '}
                          {t('create.workspace.settings.unavailableReason', {
                            reason: text(reasonTextInline(workspace.reason)),
                          })}
                        </span>
                      ))}
                      .
                    </span>
                  )}
                </Field.Description>
                {errors.target && <Field.Error>{text(errors.target)}</Field.Error>}
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 py-3">
            <SwitchField
              label={t('create.workspace.settings.slugSwitch')}
              checked={choice.slug.on}
              description={t('create.workspace.settings.slugSwitchDescription')}
              onCheckedChange={(on) =>
                set({
                  slug: on ? { on: true, value: '', edited: false } : initialWorkspaceChoice.slug,
                })
              }
            />
            {choice.slug.on && (
              <Field invalid={Boolean(slugErrorText)}>
                <Field.Label>{t('create.workspace.settings.slugLabel')}</Field.Label>
                <TextInput
                  ref={refs.slug}
                  value={slugValue}
                  maxLength={200}
                  placeholder={t('create.workspace.settings.slugPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    set({ slug: { on: true, value: event.target.value, edited: true } })
                  }
                />
                <Field.Description>
                  <Trans
                    i18nKey="create.workspace.settings.slugHelp"
                    components={{
                      branch: (
                        <BranchRef name={branchPreview(options, effectiveSlug(choice, title))} />
                      ),
                    }}
                  />
                </Field.Description>
                {slugErrorText && <Field.Error>{slugErrorText}</Field.Error>}
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 pt-3">
            <SwitchField
              label={t('create.workspace.settings.branchSwitch')}
              checked={choice.branch.on}
              description={t('create.workspace.settings.branchSwitchDescription')}
              onCheckedChange={(on) =>
                set({
                  branch: on
                    ? { on: true, name: '', edited: false }
                    : initialWorkspaceChoice.branch,
                })
              }
            />
            {choice.branch.on && (
              <Field invalid={Boolean(branchError)}>
                <Field.Label>{t('create.workspace.settings.branchLabel')}</Field.Label>
                <TextInput
                  ref={refs.branch}
                  value={branchValue}
                  maxLength={200}
                  placeholder={t('create.workspace.settings.branchPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    set({ branch: { on: true, name: event.target.value, edited: true } })
                  }
                />
                <Field.Description>{t('create.workspace.settings.branchHelp')}</Field.Description>
                {branchError && <Field.Error>{branchError}</Field.Error>}
              </Field>
            )}
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible>
  );
}
