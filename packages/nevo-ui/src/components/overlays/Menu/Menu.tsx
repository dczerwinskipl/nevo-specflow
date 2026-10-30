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
import { optionDescriptionClassName, optionLabelClassName } from '../../forms/shared/optionRecipes';
import { Icon, type IconGlyph } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

const MenuRadioValueContext = createContext<string | undefined>(undefined);

export interface MenuRadioGroupProps extends Omit<
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
      <DropdownMenu.RadioGroup ref={ref} value={value} onValueChange={onValueChange} {...props} />
    </MenuRadioValueContext.Provider>
  );
});

export type MenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content> & {
  container?: HTMLElement | null;
};

export const MenuContent = forwardRef<ComponentRef<typeof DropdownMenu.Content>, MenuContentProps>(
  function MenuContent(
    {
      align = 'start',
      children,
      className,
      container,
      collisionPadding = 8,
      sideOffset = 8,
      ...props
    },
    ref,
  ) {
    const capture = useDesignMetadata('Menu');

    return (
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          ref={ref}
          align={align}
          className={cn(
            'menu-content',
            floatingContentClassName,
            'w-56 [&]:min-w-0 max-w-[var(--radix-dropdown-menu-content-available-width)]',
            className,
          )}
          collisionPadding={collisionPadding}
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
  leadingIcon?: IconGlyph;
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
  /**
   * Optional second line, reusing `Select`/`Combobox`'s own option anatomy
   * (`optionDescriptionClassName`) so a richer choice — a model's available efforts, or why a
   * disabled option is unavailable — never drifts from the shared recipe those pickers already use.
   */
  description?: ReactNode;
}

export const MenuRadioItem = forwardRef<
  ComponentRef<typeof DropdownMenu.RadioItem>,
  MenuRadioItemProps
>(function MenuRadioItem({ children, className, description, disabled, value, ...props }, ref) {
  const selectedValue = useContext(MenuRadioValueContext);
  const capture = useDesignMetadata('MenuRadioItem', {
    state: disabled ? 'disabled' : selectedValue === value ? 'checked' : 'unchecked',
  });

  return (
    <DropdownMenu.RadioItem
      ref={ref}
      className={cn(menuItemVariants({ tone: 'neutral' }), description && 'items-start', className)}
      disabled={disabled}
      value={value}
      {...props}
      {...capture}
    >
      <span
        className={cn(
          'inline-flex size-icon-sm shrink-0 items-center justify-center',
          description && 'self-start',
        )}
        {...designSlot('MenuRadioItem', 'indicator')}
      >
        <DropdownMenu.ItemIndicator>
          <Icon name="check" size="sm" />
        </DropdownMenu.ItemIndicator>
      </span>
      {description ? (
        <span className="grid min-w-0 flex-1 gap-0.5 py-0.5">
          <Typography
            as="span"
            className={cn(optionLabelClassName, 'block')}
            {...designSlot('MenuRadioItem', 'label')}
            variant="body-sm"
          >
            {children}
          </Typography>
          <Typography
            as="span"
            className={cn(optionDescriptionClassName, 'whitespace-normal')}
            variant="body-sm"
          >
            {description}
          </Typography>
        </span>
      ) : (
        <Typography
          as="span"
          className={cn(optionLabelClassName, 'flex-1')}
          {...designSlot('MenuRadioItem', 'label')}
          variant="body-sm"
        >
          {children}
        </Typography>
      )}
    </DropdownMenu.RadioItem>
  );
});

export const MenuLabel = forwardRef<
  ComponentRef<typeof DropdownMenu.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function MenuLabel({ children, className, ...props }, ref) {
  return (
    <DropdownMenu.Label ref={ref} className={cn(floatingLabelClassName, className)} {...props}>
      <Typography as="span" className="block min-w-0 truncate text-inherit" variant="section-label">
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

export interface MenuNoteProps extends Omit<ComponentPropsWithoutRef<'div'>, 'id'> {
  /** Required: pass the same value as `MenuContent aria-describedby` so the note is announced on open. */
  id: string;
}

/**
 * Non-interactive, wrapping helper text for a menu (for example why actions are unavailable).
 * Rendered inside a `role="group"` (the only non-item child `role="menu"` allows) and referenced by
 * `MenuContent aria-describedby`. Not focusable: roving focus skips it. One note per menu, after the
 * last item and a `MenuSeparator`. Titles and reasons must not go in `MenuLabel` (it truncates).
 */
export const MenuNote = forwardRef<HTMLDivElement, MenuNoteProps>(function MenuNote(
  { children, className, id, ...props },
  ref,
) {
  return (
    <DropdownMenu.Group>
      <div
        ref={ref}
        className={cn(
          'px-control-padding-compact py-1.5 text-body-sm text-content-muted [overflow-wrap:anywhere]',
          className,
        )}
        id={id}
        {...props}
      >
        {children}
      </div>
    </DropdownMenu.Group>
  );
});
