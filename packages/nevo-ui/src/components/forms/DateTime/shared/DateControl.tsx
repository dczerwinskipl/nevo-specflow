import type { ReactNode } from 'react';
import { Button as AriaButton, Group, type GroupProps } from 'react-aria-components';
import { cn } from '../../../../lib';
import { iconButtonVariants } from '../../../actions/IconButton';
import { Icon } from '../../../foundations/Icon';
import { dateControlClassName, embeddedActionFocusClassName } from './dateTime.styles';

type DesignSlotAttributes = Readonly<{ 'data-design-slot': string }>;

export interface DateControlProps extends Omit<GroupProps, 'children' | 'className'> {
  children: ReactNode;
  className?: string;
  controlSlot?: DesignSlotAttributes;
  triggerSlot?: DesignSlotAttributes;
}

export function DateControl({
  children,
  className,
  controlSlot,
  triggerSlot,
  ...props
}: DateControlProps) {
  return (
    <Group {...props} {...controlSlot} className={cn(dateControlClassName, className)}>
      {children}
      <AriaButton
        className={cn(
          iconButtonVariants({ variant: 'ghost', size: 'xs' }),
          embeddedActionFocusClassName,
        )}
        data-focus-ring="delegated"
        {...triggerSlot}
      >
        <Icon name="calendar" size="sm" />
      </AriaButton>
    </Group>
  );
}

