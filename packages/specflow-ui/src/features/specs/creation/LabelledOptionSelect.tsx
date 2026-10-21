import { Field } from '@nevo/ui';
import { OptionSelect } from '../../../shared/controls/OptionSelect';

/** An option select with its visible label. */
export function LabelledOptionSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <Field.Label>{label}</Field.Label>
      <OptionSelect
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        items={options.map((o) => ({ value: o.value, textValue: o.label, label: o.label }))}
      />
    </Field>
  );
}
