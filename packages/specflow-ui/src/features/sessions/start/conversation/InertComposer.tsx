import type { ReactNode } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, MessageComposer, useWorkspaceLayout } from '@nevo/ui';

/**
 * The Composer of a Session that cannot take a message yet (before Start, and while the started
 * Session's first snapshot loads): the field and Send are disabled, in the place and at the height
 * of the active Composer. `leading` and `trailing` hold the toolbar's disabled pickers when the
 * Session already has a model and a mode to show; the field takes its `id` from the real Composer
 * so the same label serves both.
 */
export function InertComposer({
  id,
  placeholder,
  leading,
  trailing,
}: {
  id: string;
  placeholder?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const isSplit = useWorkspaceLayout().mode === 'split';

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t('managedSession.message')}
      </label>
      <MessageComposer
        className="shadow-lg"
        enterKeyBehavior={isSplit ? 'submit' : 'newline'}
        presentation="standalone"
        disabled
        onSubmit={() => undefined}
      >
        <MessageComposer.Editor id={id} minRows={1} placeholder={placeholder} value="" readOnly />
        <MessageComposer.Toolbar>
          <div className="flex min-w-0 items-center gap-1">{leading}</div>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
            {trailing}
            <IconButton
              aria-label={t('managedSession.send')}
              disabled
              icon={Send}
              size="sm"
              type="submit"
              variant="secondary"
            />
          </div>
        </MessageComposer.Toolbar>
      </MessageComposer>
    </>
  );
}
