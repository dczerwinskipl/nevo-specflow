import { useEffect, useId, useMemo, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { sectionLabelContainerClassName } from '../../../design-system/sectionRecipes';
import { cn } from '../../../lib';
import { Typography } from '../../foundations/Typography';
import { NavigationProvider, type NavigationProviderProps } from '../NavigationCore';
import { findUnsupportedNavigationDepth, unsupportedNavigationDepthWarning } from './diagnostics';
import {
  SideNavigationItem,
  type SideNavigationMessages,
  type SideNavigationRootIcons,
} from './SideNavigationItem';

const defaultSideNavigationMessages: SideNavigationMessages = {
  collapse: (label) => `Collapse ${label}`,
  expand: (label) => `Expand ${label}`,
};

export const sideNavigationFigmaIdentity = 'SideNavigation' as const;

type AccessibleNavigationName =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: never; 'aria-labelledby': string };

type SideNavigationLabel =
  | { label: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }
  | ({ label?: never } & AccessibleNavigationName);

export type SideNavigationProps<TTarget> = Omit<
  HTMLAttributes<HTMLElement>,
  'aria-label' | 'aria-labelledby' | 'children'
> &
  Omit<NavigationProviderProps<TTarget>, 'children'> & {
    rootIcons?: SideNavigationRootIcons;
    messages?: Partial<SideNavigationMessages>;
  } & SideNavigationLabel;

export function SideNavigation<TTarget>({
  adapter,
  className,
  defaultExpandedKeys,
  expandedKeys,
  label,
  messages: messagesProp,
  nodes,
  onExpandedKeysChange,
  rootIcons,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: SideNavigationProps<TTarget>) {
  const capture = useDesignMetadata(sideNavigationFigmaIdentity);
  const messages = { ...defaultSideNavigationMessages, ...messagesProp };
  const generatedLabelId = useId();
  const resolvedLabelledBy =
    ariaLabelledBy ??
    (label !== undefined && ariaLabel === undefined ? generatedLabelId : undefined);
  const unsupported = useMemo(() => findUnsupportedNavigationDepth(nodes), [nodes]);
  const warningSignature = unsupported
    .map(({ depth, key, path }) => `${key}:${depth}:${path.join('>')}`)
    .join('|');
  const previousWarning = useRef<string | null>(null);

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      warningSignature === '' ||
      previousWarning.current === warningSignature
    ) {
      return;
    }
    previousWarning.current = warningSignature;
    console.warn(unsupportedNavigationDepthWarning(unsupported));
  }, [unsupported, warningSignature]);

  const providerProps =
    expandedKeys === undefined
      ? { adapter, defaultExpandedKeys, nodes, onExpandedKeysChange }
      : { adapter, expandedKeys, nodes, onExpandedKeysChange: onExpandedKeysChange! };

  return (
    <NavigationProvider {...providerProps}>
      <nav
        aria-label={ariaLabel}
        aria-labelledby={resolvedLabelledBy}
        className={cn('side-navigation min-w-0', className)}
        {...props}
        {...capture}
      >
        {label !== undefined ? (
          <Typography
            as="div"
            className={sectionLabelContainerClassName}
            id={generatedLabelId}
            {...designSlot(sideNavigationFigmaIdentity, 'label')}
            variant="section-label"
          >
            {label}
          </Typography>
        ) : null}
        <ul
          className="m-0 grid w-full list-none gap-0.5 p-0"
          {...designSlot(sideNavigationFigmaIdentity, 'items')}
        >
          {nodes.map((node) => (
            <SideNavigationItem
              key={node.key}
              depth={1}
              nodeKey={node.key}
              rootIcons={rootIcons}
              messages={messages}
            />
          ))}
        </ul>
      </nav>
    </NavigationProvider>
  );
}
