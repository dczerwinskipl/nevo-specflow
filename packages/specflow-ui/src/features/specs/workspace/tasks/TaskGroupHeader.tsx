import { useTranslation } from 'react-i18next';
import { OperationalGroupHeader } from '../../shared/OperationalList';

export interface TaskGroupHeaderProps {
  readonly name: string;
  readonly count: number;
  readonly isCollapsed: boolean;
  readonly tone: 'attention' | 'info' | 'neutral' | 'success';
  readonly onToggle: () => void;
}

export function TaskGroupHeader({
  name,
  count,
  isCollapsed,
  tone,
  onToggle,
}: TaskGroupHeaderProps) {
  const { t } = useTranslation();

  return (
    <OperationalGroupHeader
      label={name}
      count={count}
      tone={tone}
      expanded={!isCollapsed}
      ariaLabel={t(
        isCollapsed ? 'specifications.expandSection' : 'specifications.collapseSection',
        { label: name },
      )}
      onToggle={onToggle}
      selectable
    />
  );
}
