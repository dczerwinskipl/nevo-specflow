import { WorkspaceHeader } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { RefreshStatus } from '../../../app/loading/RefreshStatus';
import { ApplicationLocationIdentity } from '../../../app/navigation/ApplicationLocation';

/** Header of the specification list: identity, refresh progress and the list's actions. */
export function SpecsOverviewHeader({
  refreshing,
  busy,
  onCreate,
  createDisabled,
  onCreateSession,
  onRefresh,
}: {
  readonly refreshing: boolean;
  readonly busy: boolean;
  readonly onCreate?: () => void;
  readonly createDisabled: boolean;
  readonly onCreateSession?: () => void;
  readonly onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceHeader
      as="span"
      identityContent={
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <ApplicationLocationIdentity title={t('specifications.title')} view="specifications" />
          </div>
          <RefreshStatus active={refreshing} label={t('specifications.refreshing')} />
        </div>
      }
      title={t('specifications.title')}
      labels={{
        moreActions: t('specifications.moreActions'),
        menuScope: t('specifications.title'),
      }}
      actions={[
        ...(onCreate
          ? [
              {
                id: 'create',
                label: t('specifications.create'),
                icon: 'plus' as const,
                primary: true,
                disabled: createDisabled,
                onPress: onCreate,
              },
            ]
          : []),
        {
          id: 'create-session',
          icon: 'chat-plus',
          label: t('specifications.createSession'),
          disabled: !onCreateSession,
          onPress: () => onCreateSession?.(),
        },
        {
          id: 'refresh',
          icon: 'refresh',
          label: busy ? t('specifications.refreshing') : t('specifications.refresh'),
          disabled: busy,
          onPress: onRefresh,
        },
      ]}
    />
  );
}
