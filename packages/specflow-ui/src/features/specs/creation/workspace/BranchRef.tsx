import { useTranslation } from 'react-i18next';
import { cn, Icon, Typography } from '@nevo/ui';
import { branchNameParts, readableBranchName } from './model/createRequest';

/**
 * The one way a Git branch appears in Create (decision rows, notes, select items, the progress
 * page): a decorative branch icon (one size) plus the name in the `code-md` role, kept as one unit.
 * There are no parenthesised or colon variants around it; prose that has to stay plain text (button
 * labels, announcements) uses `readableBranchName` instead.
 *
 * A generated name can hold parts that exist only once the Specification is created (`<key>`,
 * `<id>`, `<slug>` from `branchPreview`): they are written as localized words in a quiet italic,
 * never as the placeholders, and the full readable name is the tooltip.
 */
export function BranchRef({
  name,
  truncate = false,
  className,
}: {
  name: string;
  /** Single line with an ellipsis (select trigger/options); otherwise a long name wraps. */
  truncate?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = branchNameParts(name);
  const pending = parts.some((part) => part.kind === 'pending');

  return (
    <span
      className={cn('inline-flex min-w-0 max-w-full items-start gap-1 align-baseline', className)}
      title={pending ? readableBranchName(name) : undefined}
    >
      <Icon name="branch" size="sm" className="mt-0.5 shrink-0 text-content-muted" />
      <Typography
        as="span"
        variant="code-md"
        className={cn('min-w-0', truncate ? 'truncate' : 'wrap-anywhere')}
      >
        {parts.map((part, index) =>
          part.kind === 'text' ? (
            part.text
          ) : (
            <span key={index} className="font-sans italic text-content-muted">
              {t(`create.workspace.rows.pending.${part.part}`)}
            </span>
          ),
        )}
      </Typography>
    </span>
  );
}
