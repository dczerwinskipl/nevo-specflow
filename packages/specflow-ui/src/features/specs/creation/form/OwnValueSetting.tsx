import type { ReactNode } from 'react';
import { Field, SwitchField } from '@nevo/ui';

/**
 * "Automatic value or my own": a switch that, when on, reveals the field for the own value. The
 * shared composition of the branch name and specification name (Create) and the Session name (New
 * Session); the caller supplies the input (`children`) and the texts. The switch description is
 * where the automatic value is said (a preview, or who generates it).
 */
export function OwnValueSetting({
  className,
  switchLabel,
  switchDescription,
  on,
  disabled,
  onOnChange,
  fieldLabel,
  fieldDescription,
  error,
  children,
}: {
  className: string;
  switchLabel: string;
  switchDescription: ReactNode;
  on: boolean;
  disabled?: boolean;
  onOnChange: (on: boolean) => void;
  fieldLabel: string;
  fieldDescription?: ReactNode;
  error?: string;
  /** The input for the own value, shown while `on`. */
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <SwitchField
        label={switchLabel}
        checked={on}
        disabled={disabled}
        description={switchDescription}
        onCheckedChange={onOnChange}
      />
      {on && (
        <Field invalid={Boolean(error)}>
          <Field.Label>{fieldLabel}</Field.Label>
          {children}
          {fieldDescription && <Field.Description>{fieldDescription}</Field.Description>}
          {error && <Field.Error>{error}</Field.Error>}
        </Field>
      )}
    </div>
  );
}
