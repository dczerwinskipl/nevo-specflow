import { type MutableRefObject, type ReactNode } from 'react';
import {
  Combobox,
  ComboboxItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export interface OptionSelectItem {
  value: string;
  /** Plain text used for filtering and as the accessible name of the chosen option. */
  textValue: string;
  /** A function receives `wraps`: true in the searchable list, whose options wrap instead of truncating. */
  label: ReactNode | ((wraps: boolean) => ReactNode);
  description?: ReactNode;
  meta?: ReactNode;
  unavailable?: boolean;
}

const labelOf = (item: OptionSelectItem, wraps: boolean) =>
  typeof item.label === 'function' ? item.label(wraps) : item.label;

/** Design-system threshold: above this many options (or for async lists) a Combobox replaces Select. */
export const COMBOBOX_MIN_OPTIONS = 9;

/**
 * One choice from a list the product cannot bound. A short list stays a Select; a list above eight
 * options becomes a searchable Combobox. Inside a `Field` both are labelled by `Field.Label`.
 */
export function OptionSelect({
  items,
  value,
  onValueChange,
  placeholder,
  invalid,
  disabled,
  controlRef,
}: {
  items: readonly OptionSelectItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Receives the focusable control (select trigger or combobox input), e.g. to focus an error. */
  controlRef?: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const comboboxLabels = {
    showOptions: t('create.options.show'),
    noResults: t('create.options.noResults'),
    loading: t('create.options.loading'),
  };
  if (items.length >= COMBOBOX_MIN_OPTIONS)
    return (
      <Combobox
        inputRef={(node) => {
          if (controlRef) controlRef.current = node;
        }}
        value={value || null}
        invalid={invalid}
        disabled={disabled}
        placeholder={placeholder}
        labels={comboboxLabels}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
      >
        {items.map((item) => (
          <ComboboxItem
            key={item.value}
            value={item.value}
            textValue={item.textValue}
            description={item.description}
            meta={item.meta}
            unavailable={item.unavailable}
          >
            {labelOf(item, true)}
          </ComboboxItem>
        ))}
      </Combobox>
    );
  return (
    <Select value={value} invalid={invalid} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger
        ref={(node) => {
          if (controlRef) controlRef.current = node;
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            textValue={item.textValue}
            description={item.description}
            meta={item.meta}
            unavailable={item.unavailable}
          >
            {labelOf(item, false)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
