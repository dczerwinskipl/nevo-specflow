import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { ArchetypeSummary } from './ArchetypeSummary';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';

/** Name and workflow of a new specification. */
export function CreateBasicsSection({
  catalogue,
  title,
  archetypeId,
  locked,
  onTitleChange,
  onArchetypeChange,
}: {
  catalogue: DemoCatalogue;
  title: string;
  archetypeId: string;
  locked: boolean;
  onTitleChange: (title: string) => void;
  onArchetypeChange: (archetypeId: string) => void;
}) {
  const { t } = useTranslation();
  const archetype = catalogue.archetypes.find((a) => a.id === archetypeId)!;
  return (
    <div className="grid gap-4">
      <Field>
        <Field.Label>{t('create.nameLabel')}</Field.Label>
        <TextInput
          value={title}
          maxLength={240}
          disabled={locked}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t('create.namePlaceholder')}
        />
      </Field>
      <div>
        <Field>
          <Field.Label>{t('create.workflowLabel')}</Field.Label>
          <LocalizedOptionPicker
            value={archetypeId}
            disabled={locked}
            onValueChange={onArchetypeChange}
            items={catalogue.archetypes.map((item) => ({
              value: item.id,
              textValue: item.title,
              label: item.title,
            }))}
          />
        </Field>
        <ArchetypeSummary key={archetypeId} archetype={archetype} />
      </div>
    </div>
  );
}
