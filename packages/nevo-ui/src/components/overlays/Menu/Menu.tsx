import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  floatingContentClassName,
  floatingItemVariants,
  floatingLabelClassName,
  floatingSeparatorClassName,
} from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon, type IconName } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

const MenuRadioValueContext = createContext<string | undefined>(undefined);

export interface MenuRadioGroupProps
  extends Omit<
    ComponentPropsWithoutRef<typeof DropdownMenu.RadioGroup>,
    'defaultValue' | 'onValueChange' | 'value'
  > {
  /**
   * Dropdown-menu radio groups are controlled-only in Radix. Requiring the value keeps
   * runtime checked state and design-capture metadata sourced from the same selection.
   */
  value: string;
  onValueChange?: (value: string) => void;
  defaultValue?: never;
}

export const MenuRadioGroup = forwardRef<
  ComponentRef<typeof DropdownMenu.RadioGroup>,
  MenuRadioGroupProps
>(function MenuRadioGroup({ onValueChange, value, ...props }, ref) {
  return (
    <MenuRadioValueContext.Provider value={value}>
      <DropdownMenu.RadioGroup
        ref={ref}
        value={value}
        onValueChange={onValueChange}
        {...props}
      />
    </MenuRadioValueContext.Provider>
  );
});

export type MenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content> & {
  container?: HTMLElement | null;
};

export const MenuContent = forwardRef<ComponentRef<typeof DropdownMenu.Content>, MenuContentProps>(
  function MenuContent(
    { align = 'start', children, className, container, sideOffset = 8, ...props },
    ref,
  ) {
    const capture = useDesignMetadata('Menu');
    return (
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          ref={ref}
          align={align}
          className={cn('menu-content', floatingContentClassName, 'w-56', className)}
          sideOffset={sideOffset}
          {...props}
          {...capture}
        >
          <div {...designSlot('Menu', 'items')}>{children}</div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    );
  },
);

export const menuItemDefaults = { state: 'default', tone: 'neutral' } as const;

export const menuItemVariants = tv({
  extend: floatingItemVariants,
  variants: {
    tone: {
      neutral: '',
      danger:
        'text-action-danger data-[tone=danger]:text-action-danger data-[tone=danger]:data-[highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[highlighted]:text-action-danger data-[tone=danger]:data-[design-prop-state=highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[design-prop-state=highlighted]:text-action-danger data-[tone=danger]:data-[disabled]:text-content-muted',
    },
  },
  compoundVariants: [
    {
      state: 'highlighted',
      tone: 'danger',
      class: 'bg-action-danger-subtle text-action-danger',
    },
  ],
  defaultVariants: menuItemDefaults,
});

export type MenuItemTone = NonNullable<VariantProps<typeof menuItemVariants>['tone']>;

export interface MenuItemProps
  extends
    Omit<ComponentPropsWithoutRef<typeof DropdownMenu.Item>, 'children'>,
    Pick<VariantProps<typeof menuItemVariants>, 'tone'> {
  children: ReactNode;
  leadingIcon?: IconName;
  shortcut?: ReactNode;
}

export const MenuItem = forwardRef<ComponentRef<typeof DropdownMenu.Item>, MenuItemProps>(
  function MenuItem(
    {
      autoFocus,
      children,
      className,
      disabled,
      leadingIcon,
      shortcut,
      tone = menuItemDefaults.tone,
      ...props
    },
    ref,
  ) {
    const capture = useDesignMetadata('MenuItem', {
      state: disabled ? 'disabled' : autoFocus ? 'highlighted' : 'default',
      tone,
    });
    return (
      <DropdownMenu.Item
        ref={ref}
        autoFocus={autoFocus}
        className={cn(menuItemVariants({ tone }), className)}
        data-design-token-background={
          autoFocus
            ? tone === 'danger'
              ? 'Color/action-danger-subtle'
              : 'Color/surface-hover'
            : undefined
        }
        data-tone={tone}
        disabled={disabled}
        {...props}
        {...capture}
      >
        {leadingIcon ? (
          <span className="inline-flex shrink-0" {...designSlot('MenuItem', 'leadingIcon')}>
            <Icon name={leadingIcon} size="sm" />
          </span>
        ) : null}
        <Typography
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current"
          {...designSlot('MenuItem', 'label')}
          variant="body-sm"
        >
          {children}
        </Typography>
        {shortcut ? (
          <Typography
            as="span"
            className="ml-auto shrink-0 pl-4 text-content-muted"
            {...designSlot('MenuItem', 'shortcut')}
            variant="code-md"
          >
            {shortcut}
          </Typography>
        ) : null}
      </DropdownMenu.Item>
    );
  },
);

export interface MenuRadioItemProps extends Omit<
  ComponentPropsWithoutRef<typeof DropdownMenu.RadioItem>,
  'children'
> {
  children: ReactNode;
}

export const MenuRadioItem = forwardRef<
  ComponentRef<typeof DropdownMenu.RadioItem>,
  MenuRadioItemProps
>(function MenuRadioItem({ children, className, disabled, value, ...props }, ref) {
  const selectedValue = useContext(MenuRadioValueContext);
  const capture = useDesignMetadata('MenuRadioItem', {
    state: disabled ? 'disabled' : selectedValue === value ? 'checked' : 'unchecked',
  });

  return (
    <DropdownMenu.RadioItem
      ref={ref}
      className={cn(menuItemVariants({ tone: 'neutral' }), className)}
      disabled={disabled}
      value={value}
      {...props}
      {...capture}
    >
      <span
        className="inline-flex size-icon-sm shrink-0 items-center justify-center"
        {...designSlot('MenuRadioItem', 'indicator')}
      >
        <DropdownMenu.ItemIndicator>
          <Icon name="check" size="sm" />
        </DropdownMenu.ItemIndicator>
      </span>
      <Typography
        as="span"
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current"
        {...designSlot('MenuRadioItem', 'label')}
        variant="body-sm"
      >
        {children}
      </Typography>
    </DropdownMenu.RadioItem>
  );
});

export const MenuLabel = forwardRef<
  ComponentRef<typeof DropdownMenu.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function MenuLabel({ children, className, ...props }, ref) {
  return (
    <DropdownMenu.Label ref={ref} className={cn(floatingLabelClassName, className)} {...props}>
      <Typography as="span" className="text-inherit" variant="section-label">
        {children}
      </Typography>
    </DropdownMenu.Label>
  );
});

export const MenuSeparator = forwardRef<
  ComponentRef<typeof DropdownMenu.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(function MenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenu.Separator
      ref={ref}
      className={cn(floatingSeparatorClassName, className)}
      {...props}
    />
  );
});
