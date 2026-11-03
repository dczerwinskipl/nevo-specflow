import { useTranslation } from 'react-i18next';
import {
  Field,
  MessageComposer,
  useWorkspaceCapabilities,
  type MessageComposerProps,
} from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { AgentChoice } from '../options/agentChoice';
import { AgentSettings } from './AgentSettings';

/** The submit event of the start Composer (the page's button or Enter in the message). */
export type StartEvent = Parameters<MessageComposerProps['onSubmit']>[1];

/**
 * The first message of a new Session in the same Composer the Session itself uses: the message,
 * then the toolbar with the work mode and model · effort the first Turn starts with. It is the
 * start form itself (`id`, the page's primary button submits it with `form`), so Enter on a
 * desktop keyboard starts the Session exactly like that button (one operation, `onStart`); on a
 * touch layout Enter adds a new line. There is no Send button in the toolbar: the page has one
 * primary action.
 */
export function FirstMessageComposer({
  id,
  catalogue,
  choice,
  message,
  locked,
  onChoiceChange,
  onMessageChange,
  onStart,
}: {
  id: string;
  catalogue: DemoCatalogue;
  choice: AgentChoice;
  message: string;
  locked: boolean;
  onChoiceChange: (choice: AgentChoice) => void;
  onMessageChange: (message: string) => void;
  onStart: (event: StartEvent) => void;
}) {
  const { t } = useTranslation();
  const { supportsSplit } = useWorkspaceCapabilities();

  return (
    <Field>
      <Field.Label>{t('sessionStart.message.label')}</Field.Label>
      <MessageComposer
        id={id}
        enterKeyBehavior={supportsSplit ? 'submit' : 'newline'}
        onSubmit={(_value, event) => onStart(event)}
        presentation="standalone"
      >
        <MessageComposer.Editor
          minRows={3}
          value={message}
          disabled={locked}
          placeholder={t('sessionStart.message.placeholder')}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        <MessageComposer.Toolbar>
          <AgentSettings
            catalogue={catalogue}
            choice={choice}
            locked={locked}
            onChange={onChoiceChange}
          />
        </MessageComposer.Toolbar>
      </MessageComposer>
      <Field.Description>{t('sessionStart.message.description')}</Field.Description>
    </Field>
  );
}
