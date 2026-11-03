import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { ContextNavigationRow } from './ContextNavigationRow';
import { ContextSection } from './ContextSectionFrame';
import { placeholderRootTabs, type PlaceholderRootTab } from './SessionContextPlaceholderTabs';

/**
 * "Planned areas": one flat list of the subjects that have no real screen yet (Files / Changes,
 * Handovers, Artifacts, Instructions, Environment). They preview what Context will cover; each row
 * still opens its own placeholder tab so the navigation mechanics (row -> tab -> tab strip ->
 * close/reopen) are real. Work history, Tasks and Documents are not here: they are real and live
 * in their own sections.
 */
export function ContextPlannedAreasSection({
  onOpen,
}: {
  onOpen: (tab: PlaceholderRootTab) => void;
}) {
  const { t } = useTranslation();

  return (
    <ContextSection title={t('sessions.context.placeholders.sectionTitle')}>
      <InformationList>
        {placeholderRootTabs.map((tab) => (
          <ContextNavigationRow
            key={tab.id}
            icon={tab.icon}
            label={t(tab.titleKey)}
            onClick={() => onOpen(tab)}
          />
        ))}
      </InformationList>
    </ContextSection>
  );
}
