import { Icon, StatusIndicator } from '@nevo/ui';
import type { Message } from '../../../../i18n/message';
import type { StartProvider } from '../catalogue/startCatalogue';
import { providerStatus } from '../fields/providerStatus';

/**
 * The agent's short status: the catalogue's own vocabulary, else (a catalogue without reason codes,
 * the demo) its availability label.
 */
export function agentStatusText(
  provider: StartProvider,
  demo: boolean,
  text: (value: Message | string) => string,
): string {
  return text(provider.status ?? providerStatus(provider, { demo }).availability);
}

/**
 * The glyph before the status: the availability dot, the alert of a confirmed unavailability, or
 * a neutral clock for a check that gave no result (pending, not an error).
 */
export function AgentStatusGlyph({
  provider,
  demo = false,
}: {
  provider: StartProvider;
  demo?: boolean;
}) {
  if (provider.available) {
    return <StatusIndicator tone={demo ? 'info' : 'success'} />;
  }

  return (
    <Icon
      name={provider.undetermined ? 'clock' : 'circle-alert'}
      size="sm"
      aria-hidden="true"
      className="text-content-muted"
    />
  );
}
