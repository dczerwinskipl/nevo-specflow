import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  CheckboxField,
  Collapsible,
  InlineNote,
  RadioGroup,
  RadioGroupOption,
  Typography,
} from '@nevo/ui';
import {
  alwaysTemplates,
  chooseArchetype,
  optionalTemplates,
  selectedArchetype,
  tickedTemplates,
  toggleTemplate,
  unmetWhenUnticked,
  type ArchetypeChoice,
} from './archetypeChoice';

/** The catalogue as the section shows it: loading, failed (with Retry) or ready. */
export type ArchetypeCatalogueState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; catalogue: ArchetypeCatalogue };

/**
 * The Archetype section of Create: the archetypes as a radio list (title and "use when"), then for
 * the selected one its instructions behind a disclosure and the documents Create makes (the
 * `always` ones as a note, the optional suggestions as checkboxes). Catalogue texts are shown as
 * delivered. The details hang under one subtle left rule: no surface, no box.
 */
export function ArchetypeSection({
  state,
  choice,
  locked,
  onChange,
}: {
  state: ArchetypeCatalogueState;
  choice: ArchetypeChoice;
  locked: boolean;
  onChange: (choice: ArchetypeChoice) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const catalogue = state.status === 'ready' ? state.catalogue : undefined;
  const archetype = selectedArchetype(catalogue, choice);
  const typeTitle = (typeId: string) =>
    catalogue?.documentTypes.find((type) => type.id === typeId)?.title ?? typeId;
  const typeUseWhen = (typeId: string) =>
    catalogue?.documentTypes.find((type) => type.id === typeId)?.useWhen;
  const ticked = archetype ? tickedTemplates(archetype, choice) : [];
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <header className="grid gap-1">
        <Typography as="h2" id={headingId} variant="title-md">
          {t('create.archetype.title')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('create.archetype.intro')}
        </Typography>
      </header>
      {state.status === 'loading' && (
        <p role="status" className="text-body-sm text-content-muted">
          {t('create.archetype.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <Alert
          tone="attention"
          title={t('create.archetype.loadFailed')}
          className="max-w-content-narrow"
        >
          <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={state.retry}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {catalogue?.archetypes.length === 0 && (
        // The project has no definitions yet: a neutral state with the command that installs them.
        <InlineNote className="max-w-content-narrow">
          {t('create.archetype.none')} <code>{t('create.archetype.installCommand')}</code>
        </InlineNote>
      )}
      {catalogue && catalogue.archetypes.length > 0 && (
        <>
          {/* Nothing selected until the user chooses (no default): the first radio is the tab stop. */}
          <RadioGroup
            value={archetype?.id ?? ''}
            onValueChange={(id) => onChange(chooseArchetype(choice, id))}
            aria-labelledby={headingId}
            disabled={locked}
          >
            {catalogue.archetypes.map((item) => (
              <RadioGroupOption
                key={item.id}
                value={item.id}
                label={item.title}
                description={item.useWhen}
              />
            ))}
          </RadioGroup>
          {!archetype ? (
            // A neutral state, not an error: the documents follow from the archetype.
            <p className="m-0 border-l border-border-subtle pl-4 text-body-sm text-content-muted">
              {t('create.archetype.choosePrompt')}
            </p>
          ) : (
            <div className="grid gap-3 border-l border-border-subtle pl-4">
              {archetype.instructions?.trim() && (
                <Collapsible key={archetype.id} className="-ml-control-padding-compact">
                  <Collapsible.Trigger className="px-0">
                    {t('create.archetype.guidance', { archetype: archetype.title })}
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <p className="whitespace-pre-line text-body-sm text-content-secondary">
                      {archetype.instructions}
                    </p>
                  </Collapsible.Content>
                </Collapsible>
              )}
              <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={locked}>
                <legend className="mb-2 p-0 text-title-sm text-content-primary">
                  {t('create.archetype.documents')}
                </legend>
                {alwaysTemplates(archetype).map((template) => (
                  <InlineNote key={template.id} icon="check">
                    {t('create.archetype.always', {
                      type: typeTitle(template.type),
                      file: template.filename,
                    })}
                  </InlineNote>
                ))}
                {optionalTemplates(archetype).map((template) => {
                  const checked = ticked.includes(template.id);
                  const useWhen = typeUseWhen(template.type);
                  return (
                    <CheckboxField
                      key={`${archetype.id}:${template.id}`}
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(value) =>
                        onChange(toggleTemplate(choice, archetype, template.id, value === true))
                      }
                      label={template.title}
                      description={
                        <>
                          <span className="font-mono">{template.filename}</span>
                          {useWhen ? ` · ${useWhen}` : ''}
                          {unmetWhenUnticked(archetype, template, ticked) && (
                            <span className="mt-1 block text-content-secondary">
                              {t('create.archetype.expectedUnticked', {
                                archetype: archetype.title,
                                type: typeTitle(template.type),
                              })}
                            </span>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </fieldset>
            </div>
          )}
        </>
      )}
    </section>
  );
}
