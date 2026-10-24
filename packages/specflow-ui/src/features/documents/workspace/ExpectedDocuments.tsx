import type { RequirementResult } from '@nevo/specflow-contracts/documents';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';

/**
 * Requirements of the archetype that are not met yet, and only those: structure, not approval (no
 * check marks, no percentage, no "complete"). Add follows `capabilities.createFile`: without it
 * the row stays as information and the read-only line above the tree says why.
 */
export function ExpectedDocuments({
  requirements,
  archetype,
  typeTitle,
  canAdd,
  onAdd,
}: {
  requirements: readonly RequirementResult[];
  /** The archetype's name, as delivered. */
  archetype: string;
  typeTitle: (typeId: string) => string;
  canAdd: boolean;
  onAdd: (typeId: string) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  if (requirements.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="grid gap-1 px-2">
      <Typography as="h2" id={headingId} variant="label-sm">
        {t('documents.requirements.title')}
      </Typography>
      <Typography as="p" variant="body-sm" className="text-content-muted">
        {t('documents.requirements.help', { archetype })}
      </Typography>
      <ul className="grid">
        {requirements.map((requirement) => {
          const title = typeTitle(requirement.documentType);
          return (
            <li
              key={requirement.documentType}
              className="flex min-h-control-height-compact min-w-0 items-center gap-2"
            >
              <span className="min-w-0 truncate text-body-md text-content-secondary">{title}</span>
              <span className="shrink-0 text-body-sm text-content-muted">
                {t('documents.requirements.count', {
                  count: requirement.count,
                  min: requirement.minCount,
                })}
              </span>
              {canAdd && (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon="plus"
                  className="ml-auto"
                  aria-label={t('documents.requirements.addLabel', { type: title })}
                  onClick={() => onAdd(requirement.documentType)}
                >
                  {t('documents.requirements.add')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
