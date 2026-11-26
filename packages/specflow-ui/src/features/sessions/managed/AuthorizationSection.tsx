import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldX } from 'lucide-react';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import { Icon, Typography, cn } from '@nevo/ui';
import { useWorkDurationLabel } from './WorkRow';
import { workStateTextClassName } from './workStatus';

/**
 * The AUTHORIZATION section of a tool's detail (full-session.md "ToolAction detail (L4)"): how the
 * permission request folded into this tool Work (`foldPermissions`) was answered and how long the
 * answer took, between what the tool ran and its result. Nothing when no permission was folded in.
 * Who answered is not claimed: the Work records the decision, not its author (ADR 0026: what Claude's
 * mode or the allowlist approved is not recorded per call).
 */
export function AuthorizationSection({ permission }: { permission: WorkSummary | undefined }) {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(
    permission ?? { state: 'queued', createdAt: '', updatedAt: '' },
  );
  if (!permission?.decision) {
    return null;
  }

  const denied = permission.decision === 'denied';

  return (
    <section className="grid min-w-0 gap-1.5" data-work-authorization={permission.decision}>
      <Typography as="h3" variant="section-label">
        {t('managedSession.workInspector.authorization.title')}
      </Typography>
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          name={denied ? ShieldX : ShieldCheck}
          size="md"
          aria-hidden="true"
          className={cn(
            'mt-0.5 shrink-0',
            denied ? workStateTextClassName('danger') : 'text-status-success',
          )}
        />
        <div className="grid min-w-0 gap-0.5">
          <Typography as="p" variant="label-md" className="text-content-primary">
            {t(`managedSession.permissionState.${permission.decision}`)}
          </Typography>
          <Typography as="p" variant="body-sm" className="text-content-muted">
            {duration
              ? t('managedSession.workInspector.authorization.answeredIn', { duration })
              : t('managedSession.workInspector.authorization.answered')}
          </Typography>
        </div>
      </div>
    </section>
  );
}
