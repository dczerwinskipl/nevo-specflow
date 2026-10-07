import { useState } from 'react';
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

export interface NewConversationModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onStart: (agent: string) => void;
}

export function NewConversationModal({ open, onClose, onStart }: NewConversationModalProps) {
  const { t } = useTranslation();
  const [agent, setAgent] = useState('Spec writer');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('specification.conversationModalTitle')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 py-2">
          <Typography variant="body-sm" className="text-content-secondary">
            {t('specification.conversationModalDescription')}
          </Typography>

          <div className="grid gap-1.5">
            <label
              htmlFor="conversation-agent-select"
              className="text-body-xs font-medium text-content-secondary"
            >
              {t('specification.agentSelectLabel')}
            </label>
            <select
              id="conversation-agent-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-control border border-border-default bg-surface-subtle px-3 py-2 text-body-sm text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <option value="Spec writer">Spec writer</option>
              <option value="General assistant">General assistant</option>
            </select>
          </div>

          <Typography variant="body-sm" className="text-content-muted">
            {t('specification.conversationModalComposerNote')}
          </Typography>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onStart(agent)}>{t('specification.openSessionAction')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
