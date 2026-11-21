import {
  linkVariants,
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
export function BaseConfigDetails({
  config,
  hasUnavailableBases = false,
  noUsableBases = false,
}: {
  config: DefaultBaseConfig | undefined;
  hasUnavailableBases?: boolean;
  noUsableBases?: boolean;
}) {
  const { t } = useTranslation();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const problem = config?.status === 'unusable' ? config : undefined;
  if (!problem && !hasUnavailableBases && !noUsableBases) {
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
            noUsableBases
              ? 'create.workspace.baseConfigDetails.how'
              : problem
                ? 'create.workspace.baseConfigDetails.why'
                : 'create.workspace.baseConfigDetails.unavailableBranches',
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent side={isSplit ? 'right' : 'bottom'} closeLabel={t('common.close')}>
        <DrawerHeader>
          <DrawerTitle>
            {t(
              problem || noUsableBases
                ? 'create.workspace.baseConfigDetails.title'
                : 'create.workspace.baseConfigDetails.unavailableBranches',
            )}
          </DrawerTitle>
          <DrawerDescription>
            {t(
              problem
                ? `create.workspace.baseConfigReason.${problem.reason}`
                : noUsableBases
                  ? 'create.workspace.baseConfigDetails.inspectReasons'
                  : 'create.workspace.baseConfigDetails.unavailableDescription',
            )}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="grid gap-3 text-body-sm text-content-secondary">
            <div className="grid gap-1">
              <h3 className="text-label-sm text-content-primary">
                {t('create.workspace.baseConfigDetails.meaning')}
              </h3>
              <p>{t('create.workspace.baseConfigDetails.explanation')}</p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-label-sm text-content-primary">
                {t('create.workspace.baseConfigDetails.nextStep')}
              </h3>
              <p>
                {t(
                  noUsableBases
                    ? 'create.workspace.baseConfigDetails.repair'
                    : 'create.workspace.baseConfigDetails.action',
                )}
              </p>
            </div>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
