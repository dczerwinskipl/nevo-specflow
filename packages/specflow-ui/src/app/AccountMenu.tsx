import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { designLayerMetadata } from '@nevo/figma-capture/metadata';
import {
  actionVariantClasses,
  cn,
  fastColorTransitionClassName,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Typography,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { LocaleMenuItems } from '../i18n';

export function AccountMenu({
  session,
  onSignOut,
}: {
  readonly session: AuthSessionResponse;
  readonly onSignOut: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const userName = session.user?.name ?? t('account.localAccess');

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          aria-label={t('account.openMenu', { name: userName })}
          className={cn(
            'flex h-control-height-default w-full cursor-pointer items-center gap-2 rounded-control border border-solid px-2 text-left',
            actionVariantClasses.ghost,
            fastColorTransitionClassName,
          )}
          type="button"
          {...designLayerMetadata({ layer: 'account-trigger' })}
        >
          <span className="flex size-control-height-inline shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-selected text-label-sm leading-none text-content-primary">
            {userInitials(userName)}
          </span>
          <Typography
            as="span"
            className="min-w-0 flex-1 truncate leading-none text-content-primary"
            variant="label-sm"
          >
            {userName}
          </Typography>
          <Icon name="chevron-down" size="sm" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" aria-label={t('account.menu')} className="w-60" side="top">
        <MenuLabel>{userName}</MenuLabel>
        <MenuSeparator />
        <LocaleMenuItems />
        {session.authenticated ? (
          <>
            <MenuSeparator />
            <MenuItem leadingIcon="log-out" onSelect={() => void onSignOut()}>
              {t('account.signOut')}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0] ?? '')[0] ?? '';
  const last = Array.from(parts[parts.length - 1] ?? '')[0] ?? '';
  return (parts.length === 1 ? first : `${first}${last}`).toUpperCase() || '?';
}
