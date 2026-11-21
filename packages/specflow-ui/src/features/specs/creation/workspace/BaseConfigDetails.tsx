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
        <Button variant="ghost" size="sm" className="-ml-control-padding-compact">
          {t(
            noUsableBases
              ? 'create.workspace.baseConfigDetails.how'
              : problem
                ? 'create.workspace.baseConfigDetails.why'
                : 'create.workspace.baseConfigDetails.unavailableBranches',
          )}
        </Button>
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
              noUsableBases
                ? 'create.workspace.baseConfigNone'
                : !problem
                  ? 'create.workspace.baseConfigDetails.unavailableDescription'
                  : problem.reason === 'ref-not-found'
                    ? 'create.workspace.baseConfigReason.ref-not-found'
                    : 'create.workspace.baseConfigDetails.description',
            )}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="grid gap-3 text-body-sm text-content-secondary">
            <p>{t('create.workspace.baseConfigDetails.explanation')}</p>
            {problem && <p>{t(`create.workspace.baseConfigReason.${problem.reason}`)}</p>}
            <p>
              {t(
                noUsableBases
                  ? 'create.workspace.baseConfigDetails.repair'
                  : 'create.workspace.baseConfigDetails.action',
              )}
            </p>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
