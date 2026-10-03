import {
  Button as AriaButton,
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  type ButtonRenderProps,
} from 'react-aria-components';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';

interface CollapsibleVisualContextValue {
  showIndicator: boolean;
}

const CollapsibleVisualContext = createContext<CollapsibleVisualContextValue | null>(null);

function useCollapsibleVisualContext(part: string) {
  const context = useContext(CollapsibleVisualContext);
  if (!context) {
    throw new Error(`${part} must be rendered inside Collapsible.`);
  }
  return context;
}

export type CollapsibleProps = Omit<
  ComponentPropsWithoutRef<typeof AriaDisclosure>,
  'className'
> & {
  className?: string;
  showIndicator?: boolean;
};

const CollapsibleRoot = forwardRef<ComponentRef<typeof AriaDisclosure>, CollapsibleProps>(
  function CollapsibleRoot(
    { className, defaultExpanded, isExpanded, showIndicator = true, ...props },
    ref,
  ) {
    const captureState = (isExpanded ?? defaultExpanded) ? 'expanded' : 'collapsed';
    const capture = useDesignMetadata('Collapsible', {
      state: captureState,
    });

    return (
      <CollapsibleVisualContext.Provider value={{ showIndicator }}>
        <AriaDisclosure
          ref={ref}
          className={cn('group/collapsible min-w-0', className)}
          defaultExpanded={defaultExpanded}
          isExpanded={isExpanded}
          {...props}
          {...capture}
        />
      </CollapsibleVisualContext.Provider>
    );
  },
);

export type CollapsibleTriggerProps = Omit<
  ComponentPropsWithoutRef<typeof AriaButton>,
  'className' | 'slot'
> & {
  className?: string;
};

type CollapsibleTriggerRenderProps = ButtonRenderProps & { defaultChildren: ReactNode };

export const CollapsibleTrigger = forwardRef<
  ComponentRef<typeof AriaButton>,
  CollapsibleTriggerProps
>(function CollapsibleTrigger({ children, className, ...props }, ref) {
  const { showIndicator } = useCollapsibleVisualContext('Collapsible.Trigger');

  return (
    <AriaButton
      ref={ref}
      className={cn(
        'flex min-h-control-height-default w-full items-center gap-2 rounded-control px-control-padding-compact text-left text-body-md text-content-secondary hover:bg-surface-hover hover:text-content-primary',
        fastColorTransitionClassName,
        className,
      )}
      slot="trigger"
      {...props}
      {...designSlot('Collapsible', 'trigger')}
    >
      {(renderProps: CollapsibleTriggerRenderProps) => (
        <>
          {showIndicator ? (
            <Icon
              className="text-content-muted transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] group-data-[expanded]/collapsible:rotate-90 motion-reduce:transition-none"
              name="chevron-right"
              size="sm"
            />
          ) : null}
          <span className="min-w-0 flex-1">
            {typeof children === 'function' ? children(renderProps) : children}
          </span>
        </>
      )}
    </AriaButton>
  );
});

export type CollapsibleContentProps = Omit<
  ComponentPropsWithoutRef<typeof AriaDisclosurePanel>,
  'className'
> & {
  className?: string;
};

export const CollapsibleContent = forwardRef<
  ComponentRef<typeof AriaDisclosurePanel>,
  CollapsibleContentProps
>(function CollapsibleContent({ children, className, ...props }, ref) {
  const { showIndicator } = useCollapsibleVisualContext('Collapsible.Content');

  return (
    <AriaDisclosurePanel
      ref={ref}
      className={cn(
        'h-[var(--disclosure-panel-height)] min-w-0 overflow-clip transition-[height] [transition-duration:var(--motion-duration-normal)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none',
        className,
      )}
      {...props}
      {...designSlot('Collapsible', 'content')}
    >
      <div className={cn('pb-3 pt-1', showIndicator && 'pl-8')}>{children}</div>
    </AriaDisclosurePanel>
  );
});

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
});
