import { FolderPlus, Layers } from 'lucide-react';
import { type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useMessage } from '../../../i18n/message';
import { Badge, Field, Icon, Typography, cn } from '@nevo/ui';
import { OptionSelect } from '../../../shared/controls/OptionSelect';
import type { DemoCreateOptions } from '@nevo/specflow-contracts/demo';
import { BranchName } from './BranchName';
import {
  NewWorkspaceSettings,
  WorkspaceLabel,
  type WorkspaceSettingsControls,
} from './NewWorkspaceSettings';
import {
  defaultSettingsSummary,
  effectiveTargetBranch,
  inheritedTarget,
  noBranchLabel,
  primaryWorkspace,
  reasonText,
  reasonTextInline,
  revalidate,
  settingsSummary,
  sharedUseNote,
  specCountLabel,
  targetStatus,
  type WorkspaceChoice,
} from './workspaceChoice';

/** What the chosen workspace tile means: facts, notes and the settings summary below the tiles. */
const note = (children: ReactNode, tone: 'muted' | 'attention' = 'muted') => (
  <Typography
    as="p"
    variant="body-sm"
    className="col-start-2 flex min-w-0 items-start gap-2 text-content-secondary"
  >
    <Icon
      name={tone === 'attention' ? 'triangle-alert' : 'info'}
      size="sm"
      className={cn(
        'mt-0.5 shrink-0',
        tone === 'attention' ? 'text-status-attention' : 'text-content-muted',
      )}
    />
    <span className="min-w-0">{children}</span>
  </Typography>
);

function Fact({
  label,
  override,
  children,
}: {
  label: string;
  override: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-content-muted">{label}</dt>
      <dd className={cn('min-w-0', override ? 'text-content-primary' : 'text-content-secondary')}>
        {children}
      </dd>
    </div>
  );
}

function IntegrationNotice({ options }: { options: DemoCreateOptions }): ReactNode {
  const { t } = useTranslation();
  const text = useMessage();
  const status = targetStatus(options);
  if (status.kind === 'ok') return null;
  if (status.kind === 'none') return note(t('create.workspace.notice.noTarget'), 'attention');
  if (status.kind === 'other-branch')
    return note(
      status.primary?.branch ? (
        <Trans
          i18nKey="create.workspace.notice.otherBranch"
          components={{
            target: <BranchName name={status.branch} />,
            current: <BranchName name={status.primary.branch} />,
          }}
        />
      ) : (
        <Trans
          i18nKey="create.workspace.notice.otherBranchNone"
          components={{ target: <BranchName name={status.branch} /> }}
        />
      ),
      'attention',
    );
  return note(
    <Trans
      i18nKey="create.workspace.notice.unavailable"
      values={{ reason: text(reasonTextInline(status.workspace.reason)) }}
      components={{ target: <BranchName name={status.branch} /> }}
    />,
    'attention',
  );
}

function BaseValue({ options, base }: { options: DemoCreateOptions; base?: string }) {
  const { t } = useTranslation();
  if (base) return <BranchName name={base} />;
  const primary = primaryWorkspace(options);
  if (options.defaultBaseRef === 'HEAD')
    return primary?.branch ? (
      <Trans
        i18nKey="create.workspace.baseHeadOnBranch"
        components={{ branch: <BranchName name={primary.branch} /> }}
      />
    ) : (
      <>{t('create.workspace.baseHead')}</>
    );
  return <BranchName name={options.defaultBaseRef} />;
}

export function NewSummary({
  options,
  choice,
  update,
  errors,
  branchConflict,
  focusBranchSignal,
  onAnnounce,
  controls,
}: {
  options: DemoCreateOptions;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  errors: ReturnType<typeof revalidate>;
  branchConflict?: string;
  focusBranchSignal?: number;
  onAnnounce: (message: string) => void;
  controls: WorkspaceSettingsControls;
}) {
  const base = choice.base.on && choice.base.ref ? choice.base.ref : undefined;
  const custom = choice.branch.on && choice.branch.name.trim() ? choice.branch.name.trim() : '';
  const overrideTarget = choice.target.on
    ? options.workspaces.find((w) => w.workspaceId === choice.target.workspaceId)
    : undefined;
  const targetPending = choice.target.on && !choice.target.workspaceId;
  const targetBranch = effectiveTargetBranch(choice, options);
  const { t } = useTranslation();
  const text = useMessage();
  const summary = settingsSummary(choice);
  return (
    <>
      <Icon name={FolderPlus} className="text-status-info" />
      <Typography
        as="p"
        variant="body-sm"
        className={cn(
          'min-w-0',
          summary === defaultSettingsSummary ? 'text-content-muted' : 'text-content-link',
        )}
      >
        {text(summary)}
      </Typography>
      <dl className="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1 text-body-sm">
        <Fact label={t('create.workspace.fact.base')} override={Boolean(base)}>
          <BaseValue options={options} base={base} />
        </Fact>
        <Fact label={t('create.workspace.fact.branch')} override={Boolean(custom)}>
          {custom ? <BranchName name={custom} /> : t('create.workspace.fact.automatic')}
        </Fact>
        <Fact label={t('create.workspace.fact.target')} override={Boolean(overrideTarget)}>
          {targetPending ? (
            <span className="text-status-attention">{t('create.workspace.fact.pickTarget')}</span>
          ) : targetBranch ? (
            <>
              <BranchName name={targetBranch} />{' '}
              <span className="text-content-muted">
                {overrideTarget
                  ? t('create.workspace.fact.pinned')
                  : t('create.workspace.fact.projectTarget')}
              </span>
            </>
          ) : overrideTarget ? (
            text(noBranchLabel)
          ) : (
            <span className="text-status-attention">{t('create.workspace.fact.noTarget')}</span>
          )}
        </Fact>
      </dl>
      {!choice.target.on && <IntegrationNotice options={options} />}
      <NewWorkspaceSettings
        options={options}
        choice={choice}
        update={update}
        errors={errors}
        branchConflict={branchConflict}
        focusBranchSignal={focusBranchSignal}
        onAnnounce={onAnnounce}
        controls={controls}
      />
    </>
  );
}

export function MainSummary({ options }: { options: DemoCreateOptions }) {
  const { t } = useTranslation();
  const text = useMessage();
  const primary = primaryWorkspace(options);
  return (
    <>
      <Icon name="folder" className="text-status-info" />
      <Typography as="p" variant="body-md" className="min-w-0 text-content-primary">
        {primary?.branch ? (
          <Trans
            i18nKey="create.workspace.main.onBranch"
            components={{ branch: <BranchName name={primary.branch} /> }}
          />
        ) : (
          t('create.workspace.main.noBranch')
        )}
      </Typography>
      {primary?.state === 'dirty' && note(t('create.workspace.dirtyNote'))}
      {primary && primary.specCount > 0 && note(text(sharedUseNote(primary.specCount, 'folder')))}
    </>
  );
}

/**
 * Integration target the chosen existing workspace brings along. Read-only: an existing workspace
 * keeps its own pin and cannot be given another. Never shows the instance id.
 */
function InheritedTargetNote({
  options,
  workspace,
}: {
  options: DemoCreateOptions;
  workspace: DemoCreateOptions['workspaces'][number];
}): ReactNode {
  const { t } = useTranslation();
  const target = inheritedTarget(options, workspace);
  if (target.kind === 'pinned')
    return (
      <>
        {note(
          <Trans
            i18nKey="create.workspace.inherited.pinned"
            components={{ branch: <BranchName name={target.branch} /> }}
          />,
        )}
        {target.drift &&
          note(
            target.drift === 'branch-changed'
              ? t('create.workspace.inherited.branchChanged')
              : t('create.workspace.inherited.unavailable'),
            'attention',
          )}
      </>
    );
  if (target.kind === 'project')
    return note(
      <Trans
        i18nKey="create.workspace.inherited.project"
        components={{ branch: <BranchName name={target.branch} /> }}
      />,
    );
  return note(t('create.workspace.inherited.none'));
}

export function ExistingSummary({
  options,
  choice,
  update,
  errors,
  controlRef,
}: {
  options: DemoCreateOptions;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  errors: ReturnType<typeof revalidate>;
  controlRef: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const linked = options.workspaces.filter((w) => w.kind === 'linked');
  const selected = linked.find((w) => w.workspaceId === choice.existingWorkspaceId);
  return (
    <>
      <div className="col-span-2 max-w-content-narrow">
        <Field invalid={Boolean(errors.existing)}>
          <Field.Label>{t('create.workspace.existing.label')}</Field.Label>
          <OptionSelect
            value={choice.existingWorkspaceId}
            invalid={Boolean(errors.existing)}
            controlRef={controlRef}
            placeholder={t('create.workspace.existing.placeholder')}
            onValueChange={(existingWorkspaceId) => update((c) => ({ ...c, existingWorkspaceId }))}
            items={linked.map((workspace) => {
              const blocked = !workspace.selectable;
              const reason = blocked
                ? text(reasonText(workspace.reason))
                : workspace.state === 'dirty'
                  ? text(reasonText('dirty'))
                  : undefined;
              return {
                value: workspace.workspaceId,
                textValue: workspace.branch ?? text(noBranchLabel),
                unavailable: blocked,
                description:
                  reason ??
                  (workspace.managed ? undefined : t('create.workspace.existing.unmanaged')),
                meta: (
                  <span className="inline-flex items-center gap-2">
                    {!workspace.managed && (
                      <Badge tone="neutral">{t('create.workspace.existing.outside')}</Badge>
                    )}
                    {text(specCountLabel(workspace.specCount))}
                  </span>
                ),
                label: (wraps) => <WorkspaceLabel workspace={workspace} truncate={!wraps} />,
              };
            })}
          />
          {errors.existing && <Field.Error>{text(errors.existing)}</Field.Error>}
        </Field>
      </div>
      {selected && !errors.existing && (
        <>
          <Icon name={Layers} className="text-status-info" />
          <Typography as="p" variant="body-md" className="min-w-0 text-content-primary">
            {selected.branch ? (
              <Trans
                i18nKey="create.workspace.existing.joins"
                components={{ branch: <BranchName name={selected.branch} /> }}
              />
            ) : (
              t('create.workspace.existing.joinsNoBranch')
            )}
          </Typography>
          {selected.specCount > 0 && note(text(sharedUseNote(selected.specCount, 'workspace')))}
          <InheritedTargetNote options={options} workspace={selected} />
          {!selected.managed && note(t('create.workspace.existing.unmanagedNote'))}
          {selected.state === 'dirty' && note(t('create.workspace.dirtyNote'))}
        </>
      )}
    </>
  );
}
