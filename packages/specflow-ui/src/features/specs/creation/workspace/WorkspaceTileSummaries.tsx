import { FolderPlus, Layers } from 'lucide-react';
import { type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';
import { useMessage } from '../../../../i18n/message';
import { Badge, DescriptionList, Field, Icon, InlineNote, Typography, cn } from '@nevo/ui';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { BranchRef } from '../../../../shared/git/BranchRef';
import {
  NewWorkspaceSettings,
  WorkspaceLabel,
  WorkspaceRef,
  type WorkspaceSettingsControls,
} from './NewWorkspaceSettings';
import { branchPreview, createOverrides, effectiveSlug } from './createRequest';
import {
  inheritedTarget,
  primaryWorkspace,
  targetStatus,
  defaultTargetWorkspaceId,
} from './workspaceTiles';
import {
  defaultSettingsSummary,
  mergeUnavailableNote,
  noBranchLabel,
  reasonText,
  settingsSummary,
  sharedUseNote,
  specCountLabel,
} from './workspaceCopy';
import type { revalidate } from './workspaceValidation';
import type { WorkspaceChoice } from './workspaceChoice';
import type { WorkspaceConflicts } from './workspaceConflicts';

/** What the chosen workspace tile means: facts, notes and the settings summary below the tiles. */
const note = (children: ReactNode, tone: 'info' | 'attention' = 'info') => (
  <InlineNote tone={tone} className="col-start-2">
    {children}
  </InlineNote>
);

/**
 * One row of the "default settings" list: label, value and an optional quiet note under the value.
 * A value the owner changed reads as primary, a default as secondary.
 */
export function SummaryRow({
  label,
  override,
  note: rowNote,
  children,
}: {
  label: string;
  override: boolean;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DescriptionList.Item>
      <DescriptionList.Term>{label}</DescriptionList.Term>
      <DescriptionList.Detail emphasis={override ? 'primary' : 'secondary'} note={rowNote}>
        {children}
      </DescriptionList.Detail>
    </DescriptionList.Item>
  );
}

/** Where the changes will be merged back: a workspace (never a bare branch) and, quietly, a caveat. */
function mergeRow(
  options: CreateOptions,
  choice: WorkspaceChoice,
  t: TFunction,
  text: ReturnType<typeof useMessage>,
): { value: ReactNode; note?: ReactNode; override: boolean } {
  if (choice.target.on) {
    const picked = options.workspaces.find((w) => w.workspaceId === choice.target.workspaceId);
    return picked
      ? {
          value: <WorkspaceRef workspace={picked} />,
          override: choice.target.workspaceId !== defaultTargetWorkspaceId(options),
        }
      : {
          value: (
            <span className="text-status-attention">{t('create.workspace.merge.pickTarget')}</span>
          ),
          override: false,
        };
  }
  const status = targetStatus(options);
  switch (status.kind) {
    case 'ok':
      return { value: <WorkspaceRef workspace={status.workspace} />, override: false };
    case 'unavailable':
      return {
        value: <WorkspaceRef workspace={status.workspace} />,
        override: false,
        note: text(mergeUnavailableNote(status.workspace.reason)),
      };
    case 'other-branch':
      return {
        value: t('create.workspace.merge.notAvailable'),
        override: false,
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
        override: false,
        note: t('create.workspace.merge.noteNoTarget'),
      };
  }
}

function BaseValue({ options, base }: { options: CreateOptions; base?: string }) {
  const { t } = useTranslation();
  if (base) return <BranchRef name={base} />;
  const primary = primaryWorkspace(options);
  if (options.defaultBaseRef === 'HEAD')
    return primary?.branch ? (
      <BranchRef name={primary.branch} />
    ) : (
      <>{t('create.workspace.baseHead')}</>
    );
  return <BranchRef name={options.defaultBaseRef} />;
}

export function NewSummary({
  options,
  choice,
  update,
  errors,
  title,
  conflicts,
  onAnnounce,
  controls,
  onRequestFocus,
}: {
  options: CreateOptions;
  choice: WorkspaceChoice;
  update: Dispatch<SetStateAction<WorkspaceChoice>>;
  errors: ReturnType<typeof revalidate>;
  /** The specification name; the generated branch preview derives from it. */
  title: string;
  conflicts?: WorkspaceConflicts;
  onAnnounce: (message: string) => void;
  controls: WorkspaceSettingsControls;
  onRequestFocus: (field: 'base' | 'target') => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const overrides = createOverrides(choice, options, title);
  const summary = settingsSummary(choice, options, title);
  const merge = mergeRow(options, choice, t, text);
  const slug = effectiveSlug(choice, title);
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
      <DescriptionList className="col-start-2" aria-label={t('create.workspace.summaryLabel')}>
        <SummaryRow label={t('create.workspace.fact.base')} override={Boolean(overrides.baseRef)}>
          <BaseValue
            options={options}
            base={choice.base.on && choice.base.ref ? choice.base.ref : undefined}
          />
        </SummaryRow>
        <SummaryRow
          label={t('create.workspace.fact.target')}
          override={merge.override}
          note={merge.note}
        >
          {merge.value}
        </SummaryRow>
        <SummaryRow
          label={t('create.workspace.fact.branch')}
          override={Boolean(overrides.branch ?? overrides.slug)}
        >
          <BranchRef name={overrides.branch ?? branchPreview(options, slug)} />
        </SummaryRow>
        <SummaryRow
          label={t('create.workspace.fact.folder')}
          override={false}
          note={
            options.worktreesRoot.exists ? undefined : t('create.workspace.folderWillBeCreated')
          }
        >
          <Typography as="span" variant="code-md" className="wrap-anywhere">
            {options.worktreesRoot.path}
          </Typography>
        </SummaryRow>
      </DescriptionList>
      <NewWorkspaceSettings
        options={options}
        choice={choice}
        update={update}
        errors={errors}
        title={title}
        conflicts={conflicts}
        onAnnounce={onAnnounce}
        controls={controls}
        onRequestFocus={onRequestFocus}
      />
    </>
  );
}

export function MainSummary({ options }: { options: CreateOptions }) {
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
            components={{ branch: <BranchRef name={primary.branch} /> }}
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
  options: CreateOptions;
  workspace: CreateOptions['workspaces'][number];
}): ReactNode {
  const { t } = useTranslation();
  const target = inheritedTarget(options, workspace);
  if (target.kind === 'pinned')
    return (
      <>
        {note(
          <Trans
            i18nKey="create.workspace.inherited.pinned"
            components={{ branch: <BranchRef name={target.branch} /> }}
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
        components={{ branch: <BranchRef name={target.branch} /> }}
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
  options: CreateOptions;
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
          <LocalizedOptionPicker
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
                components={{ branch: <BranchRef name={selected.branch} /> }}
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
