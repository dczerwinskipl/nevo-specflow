import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CheckboxField, TextArea, Typography } from '@nevo/ui';
import type { Interaction } from '@nevo/specflow-contracts/sessions';
import type { RespondAnswer } from './feed';

type Question = Extract<Interaction, { kind: 'question' }>;

/** The pending question or permission of a Session, answered from the Composer's overlay. */
export function InteractionPrompt({
  interaction,
  busy,
  onRespond,
}: {
  interaction: Interaction;
  busy: boolean;
  onRespond: (response: RespondAnswer) => void;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const promptId = useId();
  const question = (optionIds: string[], text: string) =>
    onRespond({ kind: 'question', answer: { optionIds, ...(text ? { text } : {}) } });

  return (
    <section
      aria-label={t('managedSession.responseRequired')}
      data-interaction-prompt="true"
      className="scrollbar-subtle grid max-h-[40dvh] gap-3 overflow-y-auto rounded-control border border-border-subtle p-4"
    >
      <Typography as="h2" variant="title-sm">
        {t('managedSession.responseRequired')}
      </Typography>
      <p id={promptId} className="whitespace-pre-wrap break-words text-body-sm">
        {interaction.prompt}
      </p>
      {interaction.kind === 'question' && (interaction.maxSelections ?? 1) > 1 ? (
        <MultiSelectQuestion
          interaction={interaction}
          busy={busy}
          labelledBy={promptId}
          onSubmit={question}
        />
      ) : interaction.kind === 'permission' ? (
        <>
          {interaction.action ? (
            <>
              <p className="whitespace-pre-wrap break-words text-body-sm">
                {t('managedSession.commandDirectory', { cwd: interaction.action.cwd })}
              </p>
              <pre className="whitespace-pre-wrap break-words text-body-sm">
                {interaction.action.command}
              </pre>
              <p className="text-body-sm">
                {t(
                  interaction.action.authority === 'host-execution'
                    ? 'managedSession.hostExecutionScope'
                    : 'managedSession.workspaceExecutionScope',
                )}
              </p>
            </>
          ) : (
            <p className="whitespace-pre-wrap break-words text-body-sm">
              {interaction.actionSummary}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => onRespond({ kind: 'permission', decision: 'allow' })}
            >
              {t('managedSession.allow')}
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => onRespond({ kind: 'permission', decision: 'deny' })}
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
                onClick={() => question([option.id], '')}
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
              <Button disabled={busy || !answer.trim()} onClick={() => question([], answer)}>
                {t('managedSession.respond')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * A question that accepts up to `maxSelections` options: a checkbox group and one Respond. Further
 * boxes are disabled at the cap; option IDs are sent once each, in the declared order.
 */
function MultiSelectQuestion({
  interaction,
  busy,
  labelledBy,
  onSubmit,
}: {
  interaction: Question;
  busy: boolean;
  labelledBy: string;
  onSubmit: (optionIds: string[], text: string) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [answer, setAnswer] = useState('');
  const options = interaction.options ?? [];
  const max = interaction.maxSelections ?? 1;
  const full = selected.size >= max;
  const countId = useId();
  const answerId = useId();
  const text = interaction.allowText ? answer : '';
  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked && next.size < max) {
        next.add(id);
      } else if (!checked) {
        next.delete(id);
      }

      return next;
    });

  return (
    <>
      <div
        role="group"
        aria-labelledby={labelledBy}
        aria-describedby={countId}
        className="grid gap-2"
      >
        {options.map((option) => {
          const checked = selected.has(option.id);
          // At the cap the other boxes stay focusable (`aria-disabled`); `toggle` ignores them.
          const capped = full && !checked;

          return (
            <CheckboxField
              key={option.id}
              label={option.label}
              checked={checked}
              disabled={busy}
              aria-disabled={capped || undefined}
              fieldClassName={capped ? 'opacity-60' : undefined}
              className={capped ? 'cursor-not-allowed' : undefined}
              onCheckedChange={(value) => toggle(option.id, value === true)}
            />
          );
        })}
      </div>
      <p id={countId} aria-live="polite" className="text-body-sm text-content-muted">
        {t('managedSession.selectionCount', { count: selected.size, max })}
      </p>
      {interaction.allowText && (
        <>
          <label htmlFor={answerId} className="text-body-sm">
            {t('managedSession.answer')}
          </label>
          <TextArea
            id={answerId}
            spellCheck={false}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </>
      )}
      <div>
        <Button
          disabled={busy || (selected.size === 0 && !text.trim())}
          onClick={() =>
            onSubmit(
              options.filter((option) => selected.has(option.id)).map((option) => option.id),
              text.trim() ? text : '',
            )
          }
        >
          {t('managedSession.respond')}
        </Button>
      </div>
    </>
  );
}
