import { useId, type ReactNode } from 'react';
import { cn } from '../../../lib';
import { IconButton } from '../../actions/IconButton';
import { Icon, type IconName } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useNavigationNode } from '../NavigationCore';
import {
  sideNavigationContentClassName,
  sideNavigationRowClassName,
  type SideNavigationItemState,
} from './sideNavigation.styles';

export type SideNavigationRootIcons = Readonly<Record<string, IconName | undefined>>;

export interface SideNavigationMessages {
  collapse: (label: string) => string;
  expand: (label: string) => string;
}

export function SideNavigationItem<TTarget>({
  depth,
  nodeKey,
  rootIcons,
  messages,
}: {
  depth: 1 | 2;
  nodeKey: string;
  rootIcons?: SideNavigationRootIcons;
  messages: Readonly<SideNavigationMessages>;
}) {
  const { adapter, isActive, isAncestorOfActive, isExpanded, node, toggleExpanded } =
    useNavigationNode<TTarget>(nodeKey);
  const generatedId = useId();
  const childListId = `navigation-children-${generatedId}`;
  const hasChildren = Boolean(node.children?.length);
  const canExpand = depth === 1 && hasChildren;
  const state: SideNavigationItemState = isActive
    ? 'active'
    : isAncestorOfActive
      ? 'ancestor'
      : 'none';
  const icon = depth === 1 ? rootIcons?.[node.key] : undefined;
  const contentClassName = sideNavigationContentClassName(canExpand && node.target === undefined);
  const label = (
    <Typography
      className={[
        'min-w-0 flex-1 whitespace-normal break-words text-inherit [overflow-wrap:anywhere]',
        state === 'active' ? 'font-semibold' : '',
      ].join(' ')}
      variant="body-md"
    >
      {node.label}
    </Typography>
  );
  const leadingContent = (
    <>
      {icon ? (
        <span
          className="flex size-4 shrink-0 items-center justify-center"
          data-navigation-root-icon="true"
        >
          <Icon name={icon} size="sm" />
        </span>
      ) : null}
      {label}
    </>
  );

  let content: ReactNode;
  if (canExpand && node.target === undefined) {
    content = (
      <button
        aria-label={isExpanded ? messages.collapse(node.label) : messages.expand(node.label)}
        aria-controls={childListId}
        aria-expanded={isExpanded}
        className={contentClassName}
        data-navigation-content="true"
        onClick={toggleExpanded}
        type="button"
      >
        {leadingContent}
        <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size="sm" />
      </button>
    );
  } else if (node.target !== undefined) {
    content = adapter.renderLink({
      node,
      children: leadingContent,
      className: contentClassName,
      isActive,
    });
  } else {
    content = (
      <div className={contentClassName} data-navigation-content="true">
        {leadingContent}
      </div>
    );
  }

  return (
    <li className="w-full min-w-0">
      <div
        className={sideNavigationRowClassName(state)}
        data-navigation-depth={depth}
        data-navigation-state={state}
      >
        {isActive ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-0 w-0.5 bg-action-primary',
              depth === 1 ? 'left-0 rounded-r' : '-left-2 rounded-full',
            )}
            data-navigation-active-indicator="true"
          />
        ) : null}
        {content}
        {canExpand && node.target !== undefined ? (
          <IconButton
            aria-controls={childListId}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? messages.collapse(node.label) : messages.expand(node.label)}
            className="mr-1"
            data-navigation-expand-action="true"
            icon={isExpanded ? 'chevron-down' : 'chevron-right'}
            onClick={toggleExpanded}
            size="xs"
            variant="ghost"
          />
        ) : null}
      </div>

      {canExpand && isExpanded ? (
        <div className="relative mb-0.5 mt-0.5" data-navigation-expanded-group="true">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 w-px bg-border-strong"
            data-navigation-group-guide="true"
          />
          <ul className="m-0 grid w-full list-none gap-0.5 py-0 pl-6 pr-0" id={childListId}>
            {node.children!.map((child) => (
              <SideNavigationItem
                key={child.key}
                depth={2}
                nodeKey={child.key}
                rootIcons={rootIcons}
                messages={messages}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

