import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { refusalMessageKey, taskRefusalOf } from './refusal';

export interface RefusalAlertProps {
  readonly error: unknown;
  readonly title?: string;
  /** Names a context entry the Engine refused, by its position in the list it was sent. */
  readonly entryName?: (index: number) => string;
}

/**
 * A refused Task command, explained by its code (`role="alert"`); context refusals list each
 * entry the Engine named (`details.unresolved`, `details.awaited`).
 */
export function RefusalAlert({ error, title, entryName }: RefusalAlertProps) {
  const { t } = useTranslation();
  const refusal = taskRefusalOf(error);
  const name = (index: number, key: string) => entryName?.(index) ?? key;
  const ownArtifact = refusal.invalidContext.find(
    (entry) => entry.reason === 'required-own-artifact',
  );
  if (ownArtifact) {
    // What a Task produces is an exit gate of the producing step, not its context (UX contract).
    return (
      <Alert role="alert" tone="danger" title={t('taskAuthoring.context.ownArtifactTitle')}>
        {t('taskAuthoring.context.ownArtifactBody', {
          ref: name(ownArtifact.index, ownArtifact.key),
        })}
      </Alert>
    );
  }

  return (
    <Alert role="alert" tone="danger" title={title}>
      <p>{t(refusalMessageKey(refusal))}</p>
      {refusal.unresolved.length > 0 || refusal.awaited.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {refusal.unresolved.map((entry) => (
            <li key={`u${entry.index}`}>
              {t('taskAuthoring.context.unresolvedEntry', { ref: name(entry.index, entry.key) })}
            </li>
          ))}
          {refusal.awaited.map((entry) => (
            <li key={`a${entry.index}`}>
              {t('taskAuthoring.context.awaitedEntry', { ref: name(entry.index, entry.key) })}
            </li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}
