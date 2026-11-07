import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@nevo/ui';
import { createControlWidth } from '../createFormLayout';

/**
 * The name of a new specification (the archetype is its own section, `ArchetypeSection`). An empty
 * name says so at the field once the owner typed and left it empty, or once Create was tried.
 */
export function CreateBasicsSection({
  title,
  locked,
  onTitleChange,
  tried = false,
  inputRef,
}: {
  title: string;
  locked: boolean;
  onTitleChange: (title: string) => void;
  /** Create was tried: a missing name is flagged at once. */
  tried?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const edited = useRef(false);
  const [left, setLeft] = useState(false);
  const missing = !title.trim() && (tried || left);

  return (
    <div className="grid gap-4">
      <Field invalid={missing} className={createControlWidth}>
        <Field.Label>{t('create.nameLabel')}</Field.Label>
        <TextInput
          ref={inputRef}
          value={title}
          maxLength={240}
          disabled={locked}
          onChange={(event) => {
            edited.current = true;
            onTitleChange(event.target.value);
          }}
          onBlur={() => setLeft(edited.current)}
          placeholder={t('create.namePlaceholder')}
        />
        {missing && <Field.Error>{t('create.prerequisite.title')}</Field.Error>}
      </Field>
    </div>
  );
}
