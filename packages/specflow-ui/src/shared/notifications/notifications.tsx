import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    notify: (message) => write({ id: crypto.randomUUID(), message }),
    dismiss: () => {
      if (current) write(undefined);
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
          open
          onOpenChange={(open) => {
            if (!open) store.dismiss();
          }}
        >
          <ToastTitle role="status">{notification.message}</ToastTitle>
          <ToastClose dismissLabel={t('common.dismissNotification')} />
        </Toast>
      )}
      <ToastViewport />
    </>
  );
}

/** Visit-scoped notifications and their toast host; children never re-render for a notification. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createNotificationStore);
  return (
    <Context.Provider value={store}>
      <ToastProvider>
        {children}
        <NotificationHost store={store} />
      </ToastProvider>
    </Context.Provider>
  );
}

/** Stable function that shows a notification. */
export function useNotify(): (message: string) => void {
  const store = useContext(Context);
  if (!store) throw new Error('NotificationProvider missing');
  return store.notify;
}
