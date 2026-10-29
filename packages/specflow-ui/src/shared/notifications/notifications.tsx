import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newId } from '../ids/newId';
import { ToastProvider, Toast, ToastTitle, ToastClose, ToastViewport } from '@nevo/ui';

export interface Notification {
  id: string;
  message: string;
}

/** One visit-scoped notification slot: the latest message replaces the previous one. */
export interface NotificationStore {
  readonly get: () => Notification | undefined;
  readonly notify: (message: string) => void;
  readonly dismiss: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createNotificationStore(): NotificationStore {
  let current: Notification | undefined;
  const listeners = new Set<() => void>();
  const write = (next: Notification | undefined) => {
    current = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => current,
    notify: (message) => write({ id: newId(), message }),
    dismiss: () => {
      if (current) {
        write(undefined);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}

const Context = createContext<NotificationStore | null>(null);

function NotificationHost({ store }: { store: NotificationStore }) {
  const { t } = useTranslation();
  const notification = useSyncExternalStore(store.subscribe, store.get, store.get);

  return (
    <>
      {notification && (
        <Toast
          key={notification.id}
          // A confirmation, not an interruption: announced politely (role="status").
          type="background"
          open
          onOpenChange={(open) => {
            if (!open) {
              store.dismiss();
            }
          }}
        >
          {/*
           * No live role here: the toast primitive announces the message once through its own
           * transient status region; a second role="status" would announce it twice.
           */}
          <ToastTitle>{notification.message}</ToastTitle>
          <ToastClose dismissLabel={t('common.dismissNotification')} />
        </Toast>
      )}
      <ToastViewport label={t('common.notificationsRegion', { hotkey: '{hotkey}' })} />
    </>
  );
}

/** Visit-scoped notifications and their toast host; children never re-render for a notification. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [store] = useState(createNotificationStore);

  return (
    <Context.Provider value={store}>
      {/* The label prefixes every announcement ("Powiadomienie …"), so it is translated. */}
      <ToastProvider label={t('common.notification')}>
        {children}
        <NotificationHost store={store} />
      </ToastProvider>
    </Context.Provider>
  );
}

/** Stable function that shows a notification. */
export function useNotify(): (message: string) => void {
  const store = useContext(Context);
  if (!store) {
    throw new Error('NotificationProvider missing');
  }

  return store.notify;
}
