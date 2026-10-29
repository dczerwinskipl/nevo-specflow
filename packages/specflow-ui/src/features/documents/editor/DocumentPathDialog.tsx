import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';

/**
 * The full path of the open document, wrapped and selectable, with a copy action. Touch has no
 * hover tooltip and the header title may be truncated, so this is the explicit route to the full
 * value (the document view itself carries no always-on path line).
 */
export function DocumentPathDialog({
  open,
  path,
  onOpenChange,
}: {
  open: boolean;
  path: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'copied' | 'failed' | null>(null);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await navigator.clipboard.writeText(path);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setStatus(null);
        }

        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.dialogs.path.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <Typography
            as="p"
            variant="code-md"
            data-document-path=""
            className="select-text break-all text-content-primary"
          >
            {path}
          </Typography>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {t('documents.dialogs.path.copy')}
            </Button>
            {status && (
              <Typography as="p" variant="body-sm" role="status" className="text-content-muted">
                {status === 'copied'
                  ? t('documents.dialogs.path.copied')
                  : t('documents.dialogs.path.copyFailed')}
              </Typography>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
