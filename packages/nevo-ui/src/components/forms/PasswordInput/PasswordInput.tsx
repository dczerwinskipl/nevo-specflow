import { forwardRef, useState } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { IconButton } from '../../actions/IconButton';
import { useFieldControl } from '../Field';
import { InputGroup } from '../InputGroup';
import { isAriaInvalid } from '../shared/textControlState';
import { TextInput, type TextInputProps } from '../TextInput';

export interface PasswordInputLabels {
  hide: string;
  show: string;
}

const defaultPasswordInputLabels: PasswordInputLabels = {
  hide: 'Hide password',
  show: 'Show password',
};

export interface PasswordInputProps extends Omit<TextInputProps, 'type'> {
  labels?: Partial<PasswordInputLabels>;
  wrapperClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-labelledby': ariaLabelledBy,
      className,
      disabled,
      id,
      labels: labelsProp,
      wrapperClassName,
      ...props
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    const labels = { ...defaultPasswordInputLabels, ...labelsProp };
    const field = useFieldControl({
      ariaDescribedBy,
      ariaInvalid,
      ariaLabelledBy,
      disabled,
      id,
    });
    const invalid = isAriaInvalid(field.ariaInvalid);
    const state = field.disabled ? 'disabled' : invalid ? 'invalid' : 'default';
    const capture = useDesignMetadata('PasswordInput', { state });
    const fieldSlot = field.insideField ? designSlot('Field', 'control') : {};

    return (
      <div className={cn('w-full', wrapperClassName)} {...fieldSlot} {...capture}>
        <InputGroup disabled={field.disabled} {...designSlot('PasswordInput', 'control')}>
          <TextInput
            ref={ref}
            aria-describedby={field.ariaDescribedBy}
            aria-invalid={field.ariaInvalid}
            aria-labelledby={field.ariaLabelledBy}
            className={className}
            disabled={field.disabled}
            id={field.id}
            type={visible ? 'text' : 'password'}
            {...props}
          />
          <InputGroup.Action {...designSlot('PasswordInput', 'visibilityAction')}>
            <IconButton
              aria-label={visible ? labels.hide : labels.show}
              aria-pressed={visible}
              icon={visible ? 'eye-off' : 'eye'}
              size="xs"
              variant="ghost"
              onClick={() => setVisible((current) => !current)}
            />
          </InputGroup.Action>
        </InputGroup>
      </div>
    );
  },
);
