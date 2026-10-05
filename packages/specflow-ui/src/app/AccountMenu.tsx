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
  const contextLabel = session.authenticated
    ? t('account.signedIn')
    : session.user
      ? t('account.localIdentity')
      : t('account.localAccess');

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          aria-label={t('account.openMenu', { name: userName })}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-control border border-solid px-2 py-2 text-left',
            actionVariantClasses.ghost,
            fastColorTransitionClassName,
          )}
          type="button"
          {...designLayerMetadata({ layer: 'account-trigger' })}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-selected text-label-sm text-content-primary">
            {userInitials(userName)}
          </span>
          <span className="min-w-0 flex-1">
            <Typography
              as="span"
              className="block truncate text-content-primary"
              variant="label-sm"
            >
              {userName}
            </Typography>
            <Typography as="span" className="block truncate text-content-muted" variant="body-sm">
              {contextLabel}
            </Typography>
          </span>
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
            <MenuItem onSelect={() => void onSignOut()}>{t('account.signOut')}</MenuItem>
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
