import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  linkVariants,
  useWorkspaceLayout,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../i18n/message';

/** Shared by the empty list and Create: repair details stay behind an explicit action. */
export function ArchetypeAvailabilityHelp({ problem }: { problem?: Message }) {
  const { t } = useTranslation();
  const isSplit = useWorkspaceLayout().mode === 'split';
  if (
    problem?.key !== 'create.prerequisite.noArchetypes' &&
    problem?.key !== 'create.prerequisite.invalidArchetypes'
  ) {
    return null;
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={`${linkVariants({ layout: 'standalone' })} w-fit text-label-sm`}
        >
          {t(
            problem.key === 'create.prerequisite.noArchetypes'
              ? 'create.archetype.howToAdd'
              : 'create.archetype.howToFix',
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent side={isSplit ? 'right' : 'bottom'} closeLabel={t('common.close')}>
        <DrawerHeader>
          <DrawerTitle>{t('create.archetype.helpTitle')}</DrawerTitle>
          <DrawerDescription>{t(problem.key)}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <p className="wrap-anywhere text-body-sm text-content-secondary">
            {t(
              problem.key === 'create.prerequisite.invalidArchetypes'
                ? 'create.archetype.repairHelp'
                : 'create.archetype.installHelp',
            )}
          </p>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
