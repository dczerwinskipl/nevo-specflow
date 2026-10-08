import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import type { TaskExecutionReadiness } from './model';

export interface ExecuteModalProps {
  readonly open: boolean;
  readonly selectedTasks: readonly string[];
  readonly executionReadiness?: TaskExecutionReadiness;
  readonly onClose: () => void;
  readonly onExecute?: (agent: string) => void;
}

export function ExecuteModal({ open, onClose }: ExecuteModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('specification.executeModalTitle')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="py-4">
          <Typography variant="body-sm" className="text-content-muted">
            {t('common.notImplemented')}
          </Typography>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
