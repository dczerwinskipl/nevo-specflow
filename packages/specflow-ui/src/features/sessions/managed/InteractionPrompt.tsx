import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, TextArea, Typography } from '@nevo/ui';
import type { Interaction } from '@nevo/specflow-contracts/sessions';

/** The pending question or permission of a Session, answered from the Composer's overlay. */
export function InteractionPrompt({
  interaction,
  busy,
  onRespond,
}: {
  interaction: Interaction;
  busy: boolean;
  onRespond: (answer: string, optionId?: string, allow?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const unsupported = interaction.kind === 'question' && (interaction.maxSelections ?? 1) > 1;

  return (
    <section
      aria-label={t('managedSession.responseRequired')}
      data-interaction-prompt="true"
      className="scrollbar-subtle grid max-h-[40dvh] gap-3 overflow-y-auto rounded-control border border-border-subtle p-4"
    >
      <Typography as="h2" variant="title-sm">
        {t('managedSession.responseRequired')}
      </Typography>
      <p className="whitespace-pre-wrap break-words text-body-sm">{interaction.prompt}</p>
      {unsupported ? (
        <Alert tone="attention" title={t('managedSession.unsupportedQuestion')} />
      ) : interaction.kind === 'permission' ? (
        <>
          <p className="break-words text-body-sm">{interaction.actionSummary}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => onRespond('', undefined, true)}>
              {t('managedSession.allow')}
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => onRespond('', undefined, false)}
            >
              {t('managedSession.deny')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {interaction.options?.map((option) => (
              <Button
                key={option.id}
                className="max-w-full whitespace-normal text-left"
                disabled={busy}
                variant="secondary"
                onClick={() => onRespond('', option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {interaction.allowText && (
            <>
              <label htmlFor="managed-answer" className="text-body-sm">
                {t('managedSession.answer')}
              </label>
              {/* A structured interaction response, not free prose — the main message composer
                  below keeps native spellcheck; this one does not need the red squiggly
                  underlines. */}
              <TextArea
                id="managed-answer"
                spellCheck={false}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <Button disabled={busy || !answer.trim()} onClick={() => onRespond(answer)}>
                {t('managedSession.respond')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
