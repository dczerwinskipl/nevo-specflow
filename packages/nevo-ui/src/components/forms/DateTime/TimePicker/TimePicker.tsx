import { Time } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import {
  Button as AriaButton,
  DialogTrigger,
  Group,
  TimeField as AriaTimeField,
  type TimeFieldProps as AriaTimeFieldProps,
} from 'react-aria-components';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../../lib';
import { iconButtonVariants } from '../../../actions/IconButton';
import { Icon } from '../../../foundations/Icon';
import { useFieldControl } from '../../Field';
import { AdaptivePickerSurface } from '../shared/AdaptivePickerSurface';
import { clampPickerValue } from '../shared/clampPickerValue';
import { DateSegments } from '../shared/DateSegments';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { MinuteStep } from '../shared/TimeSelector.model';
import { usePickerDraftState } from '../shared/usePickerDraftState';
import { usePickerPresentation } from '../shared/usePickerPresentation';
import { dateControlClassName, embeddedActionFocusClassName } from '../shared/dateTime.styles';
import { TimePickerContent } from './TimePickerContent';

export interface TimePickerLabels {
  cancel: string;
  dialog: string;
  done: string;
  hour: string;
  minute: string;
  now: string;
  time: string;
  trigger: string;
}

export const defaultTimePickerLabels: TimePickerLabels = {
  cancel: 'Cancel',
  dialog: 'Choose time',
  done: 'Done',
  hour: 'Hour',
  minute: 'Minute',
  now: 'Now',
  time: 'Time',
  trigger: 'Choose time',
};

export interface TimePickerProps extends Omit<
  AriaTimeFieldProps<Time>,
  | 'children'
  | 'className'
  | 'granularity'
  | 'isDisabled'
  | 'isInvalid'
  | 'isReadOnly'
  | 'isRequired'
  | 'defaultValue'
  | 'maxValue'
  | 'minValue'
  | 'onChange'
  | 'value'
> {
  className?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  defaultOpen?: boolean;
  defaultValue?: Time | null;
  disabled?: boolean;
  invalid?: boolean;
  labels?: Partial<TimePickerLabels>;
  maxValue?: Time | null;
  minValue?: Time | null;
  minuteStep?: MinuteStep;
  onChange?: (value: Time | null) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  pickerPresentation?: PickerPresentation;
  readOnly?: boolean;
  required?: boolean;
  value?: Time | null;
}

export function TimePicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  className,
  defaultOpen,
  defaultValue,
  disabled = false,
  hourCycle,
  invalid = false,
  labels: labelsProp,
  maxValue,
  minValue,
  minuteStep = 1,
  onChange,
  onOpenChange,
  open,
  pickerPresentation,
  readOnly = false,
  required = false,
  value,
  ...props
}: TimePickerProps) {
  const labels = { ...defaultTimePickerLabels, ...labelsProp };
  const presentation = usePickerPresentation(pickerPresentation);
  const fallbackValue = clampPickerValue(new Time(9, 0), minValue, maxValue);
  const picker = usePickerDraftState({
    defaultOpen,
    defaultValue,
    fallbackValue,
    onChange,
    onOpenChange,
    open,
    value,
  });

  const field = useFieldControl({
    ariaDescribedBy,
    ariaInvalid: invalid ? true : ariaInvalid,
    ariaLabelledBy,
    disabled,
    id: props.id,
  });
  const resolvedInvalid = field.ariaInvalid === true || field.ariaInvalid === 'true';
  const state = field.disabled ? 'disabled' : resolvedInvalid ? 'invalid' : 'default';
  const capture = useDesignMetadata('TimePicker', { state });

  return (
    <AriaTimeField
      {...props}
      {...capture}
      aria-describedby={field.ariaDescribedBy}
      aria-labelledby={field.ariaLabelledBy}
      className={cn('w-full', className)}
      granularity="minute"
      hourCycle={hourCycle}
      id={field.id}
      isDisabled={field.disabled}
      isInvalid={resolvedInvalid}
      isReadOnly={readOnly}
      isRequired={required}
      maxValue={maxValue}
      minValue={minValue}
      value={picker.committedValue}
      onChange={picker.commitValue}
    >
      <Group className={dateControlClassName} {...designSlot('TimePicker', 'control')}>
        <DateSegments />
        {!readOnly ? (
          <DialogTrigger isOpen={picker.resolvedOpen} onOpenChange={picker.setOpen}>
            <AriaButton
              aria-label={labels.trigger}
              data-focus-ring="delegated"
              isDisabled={field.disabled}
              className={cn(
                iconButtonVariants({ variant: 'ghost', size: 'xs' }),
                embeddedActionFocusClassName,
              )}
              {...designSlot('TimePicker', 'trigger')}
            >
              <Icon name="clock" size="sm" />
            </AriaButton>
            <AdaptivePickerSurface aria-label={labels.dialog} presentation={presentation}>
              <TimePickerContent
                hourCycle={hourCycle}
                labels={labels}
                maxValue={maxValue}
                minValue={minValue}
                minuteStep={minuteStep}
                presentation={presentation}
                value={picker.draftValue ?? fallbackValue}
                onCancel={picker.cancel}
                onChange={picker.setDraftValue}
                onDone={picker.done}
              />
            </AdaptivePickerSurface>
          </DialogTrigger>
        ) : null}
      </Group>
    </AriaTimeField>
  );
}
