import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@nevo/ui';

/** The name of a new specification (the archetype is its own section, `ArchetypeSection`). */
export function CreateBasicsSection({
  title,
  locked,
  onTitleChange,
}: {
  title: string;
  locked: boolean;
  onTitleChange: (title: string) => void;
}) {
  const { t } = useTranslation();

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
    </div>
  );
}
