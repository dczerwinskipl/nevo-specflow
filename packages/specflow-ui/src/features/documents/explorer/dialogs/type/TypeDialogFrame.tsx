import type { ArchetypeCatalogue, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nevo/ui';
import type { TypeChoice } from '../../../catalogue/documentTypePolicy';

/** The catalogue as the dialogs need it: its data and how to retry a failed read. */
export interface CatalogueState {
  data?: ArchetypeCatalogue;
  isPending: boolean;
  retry: () => void;
}

/** A failure of the dialog's operation, already translated; `resume` offers the same operation again. */
export interface TypeDialogError {
  message: string;
  resume?: boolean;
}

export interface CommonProps {
  tree: Tree;
  catalogue: CatalogueState;
  /** The operation is in flight. */
  busy: boolean;
  /** Its outcome is unknown: the dialog cannot be left until it is checked. */
  unknown: boolean;
  error?: TypeDialogError;
  onClose: () => void;
}

/** Loading and failure of the catalogue inside a chooser dialog (the rest stays usable). */
export function CatalogueStatus({ catalogue }: { catalogue: CatalogueState }) {
  const { t } = useTranslation();
  if (catalogue.data) {
    return null;
  }

  if (catalogue.isPending) {
    return (
      <p role="status" className="text-body-sm text-content-muted">
        {t('documents.newDocument.loadingTypes')}
      </p>
    );
  }

  return (
    <Alert tone="attention" title={t('documents.newDocument.typesFailed')}>
      <Button size="sm" variant="secondary" onClick={catalogue.retry}>
        {t('common.retry')}
      </Button>
    </Alert>
  );
}

export function OperationError({
  error,
  busy,
  onResume,
}: {
  error?: TypeDialogError;
  busy: boolean;
  onResume: () => void;
}) {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }

  return (
    <Alert
      role="alert"
      tone="attention"
      title={error.message}
      actions={
        error.resume ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onResume}>
            {t('documents.tree.error.resume')}
          </Button>
        ) : undefined
      }
    />
  );
}

export function TypeDialogFrame({
  open,
  busy,
  unknown,
  title,
  description,
  body,
  footerError,
  submitLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  unknown: boolean;
  title: string;
  description: string;
  body: ReactNode;
  footerError: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy && !unknown) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">{body}</DialogBody>
        {footerError}
        <DialogFooter>
          <Button variant="secondary" disabled={busy || unknown} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const choiceOf = (all: readonly TypeChoice[], id: string) =>
  all.find((choice) => choice.type.id === id);
