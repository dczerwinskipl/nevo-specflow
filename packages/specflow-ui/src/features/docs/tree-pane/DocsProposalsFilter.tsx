import { useTranslation } from 'react-i18next';
import {
  CheckboxField,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Typography,
} from '@nevo/ui';

/**
 * The search's "Include proposals (N)" checkbox and the hint that says what a proposal is. It
 * stays mounted while its answer loads (keeping its place and focus): a change is ignored while
 * `pending`, and the count is left out until the answer is there.
 */
export function DocsProposalsFilter({
  checked,
  count,
  pending,
  onCheckedChange,
}: {
  checked: boolean;
  /** Proposals among the results (included) or left out of them; `undefined` while unknown. */
  count: number | undefined;
  pending: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-center gap-1">
      <CheckboxField
        checked={checked}
        aria-disabled={pending || undefined}
        onCheckedChange={(next) => {
          if (!pending) {
            onCheckedChange(next === true);
          }
        }}
        label={
          count === undefined
            ? t('docs.search.includeProposalsAny')
            : t('docs.search.includeProposals', { count })
        }
      />
      <Popover>
        <PopoverTrigger asChild>
          <IconButton
            icon="info"
            size="xs"
            variant="ghost"
            aria-label={t('docs.search.proposalsHintLabel')}
          />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('docs.search.proposalsHint')}
          </Typography>
        </PopoverContent>
      </Popover>
    </div>
  );
}
