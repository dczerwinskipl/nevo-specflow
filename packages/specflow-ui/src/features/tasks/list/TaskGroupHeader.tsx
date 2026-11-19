import { useTranslation } from 'react-i18next';
import { OperationalGroupHeader } from '../../../shared/operational-list';

export interface TaskGroupHeaderProps {
  readonly name: string;
  readonly count: number;
  readonly isCollapsed: boolean;
  readonly tone: 'attention' | 'info' | 'neutral' | 'success';
  readonly controlsId?: string;
  /** A search is active: the group is forced expanded and the toggle does nothing. */
  readonly searching?: boolean;
  readonly onToggle: () => void;
}

export function TaskGroupHeader({
  name,
  count,
  isCollapsed,
  tone,
  controlsId,
  searching = false,
  onToggle,
}: TaskGroupHeaderProps) {
  const { t } = useTranslation();

  return (
    <OperationalGroupHeader
      headingTag="h3"
      label={name}
      count={count}
      tone={tone}
      expanded={!isCollapsed}
      controlsId={controlsId}
      ariaLabel={t(
        searching
          ? 'specifications.sectionSearchExpanded'
          : isCollapsed
            ? 'specifications.expandSection'
            : 'specifications.collapseSection',
        { label: name },
      )}
      onToggle={onToggle}
      ariaDisabled={searching}
    />
  );
}
