import { Typography } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';

/**
 * Who answers from here on (full-session.md "Conversation"): one quiet line before the first agent
 * output of a Turn, "Claude · Opus 5.5", with the provider's mark. The Session's executor, as the
 * Runtime names it; never repeated on every entry of the Turn.
 */
export function AgentIdentity({
  providerId,
  providerTitle,
  modelTitle,
}: {
  providerId: string;
  providerTitle: string;
  modelTitle?: string;
}) {
  return (
    <Typography
      as="p"
      variant="body-sm"
      data-agent-identity=""
      className="flex min-w-0 items-center gap-2 text-content-secondary"
    >
      <SessionProviderIcon providerId={providerId} />
      <span className="min-w-0 truncate">
        <span className="font-medium text-content-primary">{providerTitle}</span>
        {modelTitle ? ` · ${modelTitle}` : ''}
      </span>
    </Typography>
  );
}
