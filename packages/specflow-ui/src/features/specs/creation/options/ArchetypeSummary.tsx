import { AccentBlock, Collapsible, Icon, Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { useTranslation } from 'react-i18next';

type Archetype = DemoCatalogue['archetypes'][number];

/**
 * Read-only catalogue metadata; this summary never changes the planned documents.
 * phase C: replaced by the archetype section of the design (list, ticks, instructions).
 */
export function ArchetypeSummary({ archetype }: { archetype?: Archetype }) {
  const { t } = useTranslation();
  if (!archetype)
    return (
      <Typography as="p" variant="body-sm" className="mt-3 text-content-secondary">
        {t('create.archetype.unavailable')}
      </Typography>
    );
  const required =
    archetype.workflow?.requiredDocuments ??
    archetype.documents.filter((d) => d.include === 'always').map((d) => d.filename);
  const suggested =
    archetype.workflow?.suggestedDocuments ??
    archetype.documents.filter((d) => d.include === 'optional').map((d) => d.filename);
  const phases = archetype.workflow?.phases;
  const hasDetails = required.length + suggested.length > 0;
  const groups = [
    ['required', t('create.archetype.requiredDocuments'), required],
    ['suggested', t('create.archetype.suggestedLater'), suggested],
  ] as const;
  return (
    <AccentBlock role="group" aria-label={t('create.archetype.info')} className="mt-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <Icon name="workflow" className="text-status-info" />
        <Typography as="p" variant="body-md" className="min-w-0 text-content-primary">
          {archetype.description?.trim() || t('create.archetype.noDescription')}
        </Typography>
        {phases && phases.length > 0 && (
          <>
            <span aria-hidden="true" />
            <ol
              aria-label={t('create.archetype.phases')}
              className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 text-body-sm text-content-secondary"
            >
              {phases.map((phase, index) => (
                <li key={`${index}-${phase}`} className="flex min-w-0 max-w-full items-start gap-2">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-content-muted">
                      →
                    </span>
                  )}
                  <span className="min-w-0">{phase}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {!archetype.workflow && (
          <>
            <span aria-hidden="true" />
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('create.archetype.noPhases')}
            </Typography>
          </>
        )}
        <Icon name="file" size="sm" className="text-content-muted" />
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {required.length === 0
            ? t('create.archetype.requiredNone')
            : t('create.archetype.requiredCount', { count: required.length })}
          {suggested.length > 0
            ? ` · ${t('create.archetype.suggestedCount', { count: suggested.length })}`
            : ''}
        </Typography>
        {hasDetails && (
          <Collapsible className="col-start-2 -ml-control-padding-compact">
            <Collapsible.Trigger className="px-0">
              {t('create.archetype.details')}
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div className="grid min-w-0 gap-3 text-body-sm text-content-secondary">
                {groups.map(([id, label, documents]) =>
                  documents.length > 0 ? (
                    <div key={id}>
                      <p className="text-label-sm text-content-primary">{label}</p>
                      <ul className="mt-1 grid gap-1">
                        {documents.map((name) => (
                          <li className="break-words" key={name}>
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            </Collapsible.Content>
          </Collapsible>
        )}
      </div>
    </AccentBlock>
  );
}
