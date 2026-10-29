import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@nevo/ui';
import type { CreateLeaveGuard } from './useCreateLeaveGuard';

/** Confirmation shown when the user leaves a Create form that has unsaved edits. */
export function CreateLeaveDialog({ guard }: { guard: CreateLeaveGuard }) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={guard.open}
      onOpenChange={(open) => {
        if (!open) {
          guard.stay();
        }
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          guard.safeLeave.current?.focus();
        }}
        onCloseAutoFocus={guard.restoreFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('create.leave.title')}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription>{t('create.leave.description')}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button ref={guard.safeLeave} variant="secondary" onClick={guard.stay}>
              {t('create.leave.stay')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={guard.discard}>
              {t('create.leave.discard')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
