import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, InputGroup, TextInput, cn } from '@nevo/ui';

/**
 * The search field above a document tree: a search icon, the text and, while there is text, a clear
 * button. Escape with text clears it too (`onClear`); the browser's own clear button is hidden.
 */
export function TreeSearchField({
  label,
  value,
  maxLength,
  inputRef,
  className,
  onChange,
  onClear,
}: {
  /** The field's accessible name, also its placeholder. */
  label: string;
  value: string;
  maxLength?: number;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InputGroup className={cn('min-w-0', className)}>
      <InputGroup.Addon>
        <Icon name="search" size="sm" />
      </InputGroup.Addon>
      <TextInput
        ref={inputRef}
        type="search"
        className="[&::-webkit-search-cancel-button]:appearance-none"
        aria-label={label}
        placeholder={label}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onClear();
          }
        }}
      />
      {value && (
        <InputGroup.Action>
          <IconButton
            aria-label={t('common.clearSearch')}
            icon="close"
            size="xs"
            onClick={onClear}
          />
        </InputGroup.Action>
      )}
    </InputGroup>
  );
}
