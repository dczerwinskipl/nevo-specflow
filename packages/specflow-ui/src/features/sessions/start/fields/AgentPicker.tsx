import type { Ref } from 'react';
import { cn } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import { ChoiceTile, ChoiceTileGroup } from '../../../../shared/controls/ChoiceTile';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { AgentStatusGlyph, agentStatusText } from '../diagnostics/agentStatus';

/**
 * Which agent runs the new Session: a radio group of compact cards (`ChoiceTile` `compact`: the
 * 28 px logo, the name over the short status, a fixed check slot, 72 px in every state). The
 * provider is fixed for the life of a Session, so the Composer never offers this choice.
 * Unavailable agents stay listed, greyed out, but cannot be chosen; why, and how to fix it, is said
 * once under the cards.
 */
export function AgentPicker({
  catalogue,
  providerId,
  labelledBy,
  describedBy,
  onSelect,
  groupRef,
}: {
  catalogue: StartCatalogue;
  providerId: string;
  /** The legend that names the group. */
  labelledBy: string;
  /** The line under the cards about the agents that cannot start. */
  describedBy?: string;
  onSelect: (providerId: string) => void;
  /** The group's element, where focus returns when what led away from it is gone. */
  groupRef?: Ref<HTMLDivElement>;
}) {
  const text = useMessage();
  const { providers } = catalogue;
  // No agent is listed: the availability note under the picker says why and offers a recheck.
  if (providers.length === 0) {
    return null;
  }

  const columns = cn(
    providers.length === 3 ? '@2xl:grid-cols-3' : providers.length > 1 && '@lg:grid-cols-2',
    providers.length >= 5 && '@2xl:grid-cols-3',
  );

  return (
    <div ref={groupRef} className="contents">
      <ChoiceTileGroup aria-labelledby={labelledBy} columns={columns} describedBy={describedBy}>
        {providers.map((provider) => (
          <ChoiceTile
            key={provider.id}
            size="compact"
            name="provider"
            value={provider.id}
            checked={providerId === provider.id}
            disabled={!provider.available}
            onSelect={() => onSelect(provider.id)}
            icon={<SessionProviderIcon providerId={provider.icon} size="lg" />}
            title={provider.title}
            description={
              <>
                <AgentStatusGlyph provider={provider} demo={catalogue.demo} />
                {agentStatusText(provider, catalogue.demo, text)}
              </>
            }
          />
        ))}
      </ChoiceTileGroup>
    </div>
  );
}
