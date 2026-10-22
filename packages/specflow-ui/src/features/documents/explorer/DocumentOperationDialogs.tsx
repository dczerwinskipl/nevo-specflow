import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
} from '@nevo/ui';
import type { DemoDocumentTree as Tree } from '@nevo/specflow-contracts/demo';
import { LocalizedOptionPicker } from '../../../shared/controls/LocalizedOptionPicker';
import type { DocumentDialogRequest } from './useDocumentOperations';

/** The confirmation dialogs of a move and a delete; the request decides which one is open. */
export function DocumentOperationDialogs({
  tree,
  request,
  target,
  busy,
  unknown,
  error,
  onTargetChange,
  onConfirm,
  onClose,
}: {
  tree: Tree;
  request: DocumentDialogRequest | undefined;
  /** Destination folder of a move (`''` is the top level). */
  target: string;
  busy: boolean;
  unknown: boolean;
  error: string;
  onTargetChange: (folder: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const closeUnlessLocked = (open: boolean) => {
    if (!open && !busy && !unknown) onClose();
  };
  return (
    <>
      <Dialog open={request?.action === 'move'} onOpenChange={closeUnlessLocked}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {request?.kind === 'folder'
                ? t('documents.tree.moveFolderTitle')
                : t('documents.tree.moveFileTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-3 break-all text-body-sm">{request?.path}</p>
            {request?.action === 'move' && (
              <Field>
                <Field.Label>{t('documents.tree.targetFolder')}</Field.Label>
                <LocalizedOptionPicker
                  value={'path:' + target}
                  disabled={busy || unknown}
                  onValueChange={(value) => onTargetChange(value.slice(5))}
                  items={tree.folders
                    .filter(
                      (folder) =>
                        !request.path ||
                        (folder.path !== request.path &&
                          !folder.path.startsWith(request.path + '/')),
                    )
                    .map((folder) => ({
                      value: 'path:' + folder.path,
                      textValue: folder.path || t('documents.tree.topLevel'),
                      label: folder.path || t('documents.tree.topLevel'),
                    }))}
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="mt-3 text-body-sm text-content-error">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" disabled={busy || unknown} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy} onClick={onConfirm}>
              {t('documents.tree.move')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={request?.action === 'delete'} onOpenChange={closeUnlessLocked}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {request?.kind === 'folder'
                ? t('documents.tree.deleteFolderTitle')
                : t('documents.tree.deleteFileTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="mb-3 block break-all text-content-primary">{request?.path}</span>
              {request?.kind === 'folder'
                ? t('documents.tree.deleteFolderWarning')
                : t('documents.tree.deleteFileWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-body-sm text-content-error">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" disabled={busy || unknown}>
                {t('common.cancel')}
              </Button>
            </AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={onConfirm}>
              {t('documents.tree.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
