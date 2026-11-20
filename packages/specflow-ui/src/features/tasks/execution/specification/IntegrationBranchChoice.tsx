import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';
import {
  RadioGroup,
  RadioGroupOption,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Typography,
} from '@nevo/ui';
import type { IntegrationBranchCandidate, RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import { CopyAction } from './CopyAction';

type TargetMissing = Extract<RepositoryBlocker, { kind: 'integration-target-missing' }>;

/** The radio value of "Another local branch…" (never a branch: radio values are prefixed). */
const OTHER = 'other';
const CANDIDATE = 'candidate:';

/** A YAML plain scalar when the name reads as a string; quoted when YAML would read it otherwise. */
export function yamlScalar(value: string): string {
  const plain =
    /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(value) &&
    !/^(?:true|false|yes|no|on|off|y|n|null|~|[-+]?(?:\d[\d_]*)?\.?\d+(?:e[-+]?\d+)?)$/i.test(
      value,
    );

  return plain ? value : JSON.stringify(value);
}

/**
 * The `git:` setting for `.nevo/config.yaml`, two lines of valid YAML: the chosen branch, or the
 * placeholder `<choose a branch>` (a plain string) until there is a choice. No branch is assumed.
 */
export function integrationTargetSetting(branch: string | undefined, placeholder: string): string {
  return `git:\n  integrationTargetBranch: ${branch === undefined ? placeholder : yamlScalar(branch)}`;
}

function factsOf(t: TFunction, candidate: IntegrationBranchCandidate, specTitle: string): string {
  return candidate.facts
    .map((fact) => {
      switch (fact) {
        case 'remote-default':
          return t('workflowExecution.close.repository.targetMissing.fact.remoteDefault', {
            remote: 'remote' in candidate ? candidate.remote : '',
          });
        case 'started-from':
          return t('workflowExecution.close.repository.targetMissing.fact.startedFrom', {
            title: specTitle,
          });
        case 'primary-checkout':
          return t('workflowExecution.close.repository.targetMissing.fact.primaryCheckout');
      }
    })
    .join(' · ');
}

/**
 * No integration branch is configured (`integration-target-missing`): the Runtime's candidates as
 * radio rows with the facts that make each one a candidate, none chosen, and "Another local
 * branch…" for the rest. The `git:` setting to add names the chosen branch; until then it shows a
 * placeholder and Copy setting is off. The choice stays in the dialog: the person edits
 * `.nevo/config.yaml`, then checks again.
 */
export function IntegrationBranchChoice({
  blocker,
  specTitle,
}: {
  readonly blocker: TargetMissing;
  readonly specTitle: string;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const [choice, setChoice] = useState<string>();
  const [other, setOther] = useState<string>();
  const { candidates, otherBranches, otherBranchCount } = blocker;
  const branch = choice === OTHER ? other : choice?.slice(CANDIDATE.length);
  const setting = integrationTargetSetting(
    branch,
    t('workflowExecution.close.repository.targetMissing.placeholder'),
  );
  const none = candidates.length === 0 && otherBranches.length === 0;
  const heading = t('workflowExecution.close.repository.targetMissing.title');
  const otherSelect = (
    <Select value={other ?? ''} onValueChange={setOther}>
      <SelectTrigger
        aria-label={t('workflowExecution.close.repository.targetMissing.otherLabel')}
        className="w-full max-w-80"
      >
        <SelectValue
          placeholder={t('workflowExecution.close.repository.targetMissing.otherPlaceholder')}
        />
      </SelectTrigger>
      <SelectContent>
        {otherBranches.map((name) => (
          <SelectItem key={name} value={name}>
            <span className="font-mono">{name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <section className="grid min-w-0 gap-3" aria-label={heading}>
      <div className="grid gap-0.5">
        <Typography as="h3" variant="label-sm">
          {heading}
        </Typography>
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          <Trans
            i18nKey={
              blocker.sourceCheckout === 'primary'
                ? 'workflowExecution.close.repository.targetMissing.explanationPrimary'
                : 'workflowExecution.close.repository.targetMissing.explanationLinked'
            }
            components={{ code: <span className="font-mono" /> }}
          />
        </Typography>
      </div>
      {none ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('workflowExecution.close.repository.targetMissing.noBranch')}
        </Typography>
      ) : (
        <div className="grid min-w-0 gap-2">
          <Typography as="p" id={labelId} variant="label-sm">
            {t('workflowExecution.close.repository.targetMissing.choiceLabel')}
          </Typography>
          {candidates.length > 0 ? (
            <RadioGroup aria-labelledby={labelId} value={choice ?? ''} onValueChange={setChoice}>
              {candidates.map((candidate) => (
                <RadioGroupOption
                  key={candidate.branch}
                  value={`${CANDIDATE}${candidate.branch}`}
                  label={
                    <span className="font-mono [overflow-wrap:anywhere]">{candidate.branch}</span>
                  }
                  description={factsOf(t, candidate, specTitle)}
                />
              ))}
              {otherBranches.length > 0 ? (
                <RadioGroupOption
                  value={OTHER}
                  label={t('workflowExecution.close.repository.targetMissing.other')}
                />
              ) : null}
            </RadioGroup>
          ) : null}
          {/* Without candidates the other branches are the only choice: no radio in front. */}
          {otherBranches.length > 0 && (candidates.length === 0 || choice === OTHER) ? (
            <div className={candidates.length > 0 ? 'grid gap-1 pl-6.5' : 'grid gap-1'}>
              {otherSelect}
              {otherBranchCount > otherBranches.length ? (
                <Typography as="p" variant="body-sm" className="text-content-muted">
                  {t('workflowExecution.close.repository.targetMissing.otherLimited', {
                    shown: otherBranches.length,
                    count: otherBranchCount,
                  })}
                </Typography>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {none ? null : (
        <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1 text-body-sm">
          <pre
            aria-label={t('workflowExecution.close.repository.targetMissing.settingLabel')}
            className="m-0 max-w-full overflow-x-auto rounded-control bg-surface-control px-2 py-1 font-mono text-body-sm text-content-primary"
          >
            {setting}
          </pre>
          <CopyAction
            text={setting}
            label={t('workflowExecution.close.repository.copySetting')}
            {...(branch === undefined
              ? {
                  disabledReason: t('workflowExecution.close.repository.targetMissing.chooseFirst'),
                }
              : {})}
          />
        </div>
      )}
    </section>
  );
}
