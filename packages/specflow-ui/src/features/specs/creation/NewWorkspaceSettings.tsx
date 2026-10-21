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
import { BranchName } from './BranchName';
import {
  defaultBaseValue,
  effectiveTargetBranch,
  mergeSuggestion,
  noBranchLabel,
  reasonText,
  reasonTextInline,
  specCountLabel,
  type WorkspaceChoice,
  type WorkspaceErrors,
} from './workspaceChoice';

type FocusTarget = 'base' | 'target' | 'branch';

/** Focusable controls of the settings, so an owner can focus an invalid one without DOM queries. */
export interface WorkspaceSettingsControls {
  base: MutableRefObject<HTMLElement | null>;
  target: MutableRefObject<HTMLElement | null>;
  branch: MutableRefObject<HTMLInputElement | null>;
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
    <BranchName name={workspace.branch} truncate={truncate} />
  ) : (
    <span className={truncate ? 'truncate' : undefined}>{text(noBranchLabel)}</span>
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
  };
  const refs = controls ?? ownRefs;
  const pendingFocus = useRef<FocusTarget | null>(null);
  const seenSignal = useRef(0);
  useEffect(() => {
    if (focusBranchSignal > seenSignal.current) {
      seenSignal.current = focusBranchSignal;
      pendingFocus.current = 'branch';
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
      : branchConflict && choice.branch.name.trim() === branchConflict
        ? t('create.workspace.errors.branchExists')
        : undefined;
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
                      components={{ branch: <BranchName name={primary.branch} /> }}
                    />
                  ) : (
                    t('create.workspace.baseHead')
                  )
                ) : (
                  <Trans
                    i18nKey="create.workspace.settings.baseDefault"
                    components={{ branch: <BranchName name={options.defaultBaseRef} /> }}
                  />
                )
              }
              onCheckedChange={(on) => {
                if (baseUnavailable && on) return;
                // Enabling starts from the effective default, never from an empty select (F-08).
                set({
                  base: {
                    on,
                    ref: on && !choice.base.ref ? defaultBaseValue(options) : choice.base.ref,
                  },
                });
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
                    label: (wraps) => <BranchName name={item.ref} truncate={!wraps} />,
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
                    components={{ branch: <BranchName name={suggestion.branch} /> }}
                  />
                }
              >
                <p>
                  {currentTarget ? (
                    <Trans
                      i18nKey="create.workspace.suggestion.projectDefault"
                      components={{ branch: <BranchName name={currentTarget} /> }}
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
                    components={{ branch: <BranchName name={suggestion.branch} /> }}
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
                    components={{ branch: <BranchName name={options.integrationTargetBranch} /> }}
                  />
                ) : (
                  t('create.workspace.settings.targetUnconfigured')
                )
              }
              onCheckedChange={(on) => {
                if (targetUnavailable && on) return;
                // Never preselect: an explicit target is a pin, so only a real pick is ever sent.
                set({ target: { on, workspaceId: choice.target.workspaceId } });
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
                      textValue: workspace.branch ?? text(noBranchLabel),
                      unavailable: blocked,
                      description: blocked ? text(reasonText(workspace.reason)) : undefined,
                      meta:
                        workspace.kind === 'primary'
                          ? t('create.workspace.settings.refCurrent')
                          : text(specCountLabel(workspace.specCount)),
                      label: (wraps) => <WorkspaceLabel workspace={workspace} truncate={!wraps} />,
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
                          {workspace.branch ? (
                            <Trans
                              i18nKey="create.workspace.settings.unavailableItemBranch"
                              values={{ reason: text(reasonTextInline(workspace.reason)) }}
                              components={{ branch: <BranchName name={workspace.branch} /> }}
                            />
                          ) : (
                            t('create.workspace.settings.unavailableItemNoBranch', {
                              name: text(noBranchLabel),
                              reason: text(reasonTextInline(workspace.reason)),
                            })
                          )}
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

          <div className="grid grid-cols-1 gap-3 pt-3">
            <SwitchField
              label={t('create.workspace.settings.branchSwitch')}
              checked={choice.branch.on}
              description={t('create.workspace.settings.branchSwitchDescription')}
              onCheckedChange={(on) => set({ branch: { ...choice.branch, on } })}
            />
            {choice.branch.on && (
              <Field invalid={Boolean(branchError)}>
                <Field.Label>{t('create.workspace.settings.branchLabel')}</Field.Label>
                <TextInput
                  ref={refs.branch}
                  value={choice.branch.name}
                  maxLength={200}
                  placeholder={t('create.workspace.settings.branchPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => set({ branch: { on: true, name: event.target.value } })}
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
