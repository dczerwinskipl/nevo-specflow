import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible, RadioGroup, RadioGroupOption, Typography } from '@nevo/ui';
import type { TypeChoice, TypeChoices } from '../catalogue/documentTypePolicy';

/** Value of the "No type" option (catalogue ids start with a letter, so it never collides). */
export const noTypeValue = '-none';

function TypeOption({ choice }: { choice: TypeChoice }) {
  const { t } = useTranslation();
  const { fact } = choice;

  return (
    <RadioGroupOption
      value={choice.type.id}
      label={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{choice.type.title}</span>
          {fact && (
            <span className="text-body-sm font-normal text-content-muted">
              {fact.kind === 'expected'
                ? t('documents.newDocument.expected', { count: fact.count, min: fact.min })
                : t('documents.newDocument.present', { count: fact.count })}
            </span>
          )}
        </span>
      }
      description={choice.type.useWhen}
    />
  );
}

/**
 * The type chooser of New document and Assign type: one radio group, grouped "Suggested by
 * <archetype>", "Other types" and (New document only) "No type" last. The group names are quiet
 * labels, not headings. Catalogue texts (title, use when) are shown as delivered.
 */
export function DocumentTypeChooser({
  choices,
  value,
  onChange,
  archetype,
  allowNone,
}: {
  choices: TypeChoices;
  value: string;
  onChange: (value: string) => void;
  /** Title of the Specification's archetype ("Suggested by <archetype>"). */
  archetype: string;
  allowNone: boolean;
}) {
  const { t } = useTranslation();
  const groupLabel = (text: string, first: boolean) => (
    <Typography as="p" variant="label-sm" className={first ? undefined : 'mt-3'}>
      {text}
    </Typography>
  );

  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      aria-label={t('documents.newDocument.typeLabel')}
    >
      {choices.suggested.length > 0 &&
        groupLabel(t('documents.newDocument.suggestedBy', { archetype }), true)}
      {choices.suggested.map((choice) => (
        <TypeOption key={choice.type.id} choice={choice} />
      ))}
      {choices.other.length > 0 &&
        groupLabel(t('documents.newDocument.otherTypes'), choices.suggested.length === 0)}
      {choices.other.map((choice) => (
        <TypeOption key={choice.type.id} choice={choice} />
      ))}
      {allowNone && (
        // Last, apart from the catalogue groups: a file without a type.
        <RadioGroupOption
          value={noTypeValue}
          optionClassName="mt-3"
          label={t('documents.newDocument.noType')}
          description={t('documents.newDocument.noTypeHelp')}
        />
      )}
    </RadioGroup>
  );
}

/**
 * "How to write a <type> document": the type's instructions and, when a template is used, the
 * template's own instructions as a second paragraph. Closed by default; never stored.
 */
export function DocumentTypeGuidance({ choice }: { choice: TypeChoice | undefined }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  if (!choice) {
    return null;
  }

  const templateInstructions = choice.template?.instructions?.trim();

  return (
    <Collapsible
      ref={root}
      className="-ml-control-padding-compact"
      // Opened at the bottom of a scrolling dialog body: bring the instructions into view.
      onExpandedChange={(expanded) => {
        // The panel grows while it opens: keep the disclosure's end in view until it has grown.
        if (!expanded) {
          return;
        }

        const until = performance.now() + 600;
        const follow = () => {
          root.current?.scrollIntoView({ block: 'nearest' });
          if (performance.now() < until) {
            requestAnimationFrame(follow);
          }
        };

        requestAnimationFrame(follow);
      }}
    >
      <Collapsible.Trigger className="px-0">
        {t('documents.newDocument.guidance', { type: choice.type.title })}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="grid gap-2 text-body-sm text-content-secondary">
          <p className="whitespace-pre-line">{choice.type.instructions}</p>
          {templateInstructions && <p className="whitespace-pre-line">{templateInstructions}</p>}
        </div>
      </Collapsible.Content>
    </Collapsible>
  );
}
