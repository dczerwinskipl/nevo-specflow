import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  useWorkspaceLayout,
} from '@nevo/ui';
import type { DefaultBaseConfig } from '@nevo/specflow-contracts/specs';
import { useTranslation } from 'react-i18next';

/** The explanation stays available beside the short source error, without filling the form. */
export function BaseConfigDetails({ config }: { config: DefaultBaseConfig | undefined }) {
  const { t } = useTranslation();
  const isSplit = useWorkspaceLayout().mode === 'split';
  if (config?.status !== 'unusable') {
    return null;
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-control-padding-compact">
          {t('create.workspace.baseConfigDetails.why')}
        </Button>
      </DrawerTrigger>
      <DrawerContent side={isSplit ? 'right' : 'bottom'} closeLabel={t('common.close')}>
        <DrawerHeader>
          <DrawerTitle>{t('create.workspace.baseConfigDetails.title')}</DrawerTitle>
          <DrawerDescription>
            {t(
              config.reason === 'ref-not-found'
                ? 'create.workspace.baseConfigReason.ref-not-found'
                : 'create.workspace.baseConfigDetails.description',
            )}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="grid gap-3 text-body-sm text-content-secondary">
            <p>{t('create.workspace.baseConfigDetails.explanation')}</p>
            <p>{t(`create.workspace.baseConfigReason.${config.reason}`)}</p>
            <p>{t('create.workspace.baseConfigDetails.action')}</p>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
