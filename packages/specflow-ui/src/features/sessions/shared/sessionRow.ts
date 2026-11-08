import type { TFunction } from 'i18next';
import type { SessionListItem } from '@nevo/specflow-contracts/sessions';
import type {
  CompactFactItem,
  InlineFacts,
  SemanticSupporting,
} from '../../../shared/operational-list';
import { formatRelativeTime } from '../../../shared/operations/panel/relativeTime';

/**
 * The agent a Session row names: ids from the Session, display titles resolved by the Runtime
 * (absent when the provider or model is no longer listed). Never joined with the provider
 * catalogue in the UI.
 */
export interface SessionRowAgent {
  readonly providerId: string;
  readonly providerTitle?: string;
  readonly modelId?: string;
  readonly modelTitle?: string;
}

/** Effective Session readiness (the Runtime's provider projection). */
export type SessionRowReadiness = SessionListItem['readiness'];

/** The provider's name as it names itself, else its id. */
export function sessionProviderName(agent: SessionRowAgent): string {
  return agent.providerTitle ?? agent.providerId;
}

/** The agent fact's width cap; its full name stays in the accessible text. */
const AGENT_FACT_MAX_WIDTH = '16rem';

/**
 * The agent fact (Sessions list §3.1): the model's title, else its raw id, else the provider.
 * Assistive technology reads the provider too, since the mark showing it is decorative.
 */
export function sessionAgentFact(agent: SessionRowAgent, t: TFunction): CompactFactItem {
  const provider = sessionProviderName(agent);
  const model = agent.modelTitle ?? agent.modelId;

  return model
    ? {
        text: model,
        accessibleText: t('sessions.list.agent', { provider, model }),
        maxWidth: AGENT_FACT_MAX_WIDTH,
      }
    : { text: provider, maxWidth: AGENT_FACT_MAX_WIDTH };
}

/**
 * A Session row's inline facts, in order and each omitted when absent: the relative update, the
 * agent, the associated Task count (only above zero).
 */
export function sessionRowFacts(
  row: {
    readonly updatedAt?: string;
    readonly agent: SessionRowAgent | undefined;
    readonly taskCount: number;
  },
  t: TFunction,
  now: number,
  locale: string,
): InlineFacts {
  const age = row.updatedAt ? formatRelativeTime(row.updatedAt, now, locale) : undefined;
  const facts: CompactFactItem[] = [];
  if (age) {
    facts.push(age);
  }

  if (row.agent) {
    facts.push(sessionAgentFact(row.agent, t));
  }

  if (row.taskCount > 0) {
    facts.push({
      text: t('sessions.list.taskCount', { count: row.taskCount }),
      accessibleText: t('sessions.list.associatedTasks', { count: row.taskCount }),
    });
  }

  // At most three facts by construction.
  return facts as unknown as InlineFacts;
}

/**
 * A Session row's status (Sessions list §3.3): effective Session readiness only, never an Engine
 * attempt fact. A ready Session shows none. A sign-in is provider-wide and resolved in the
 * provider's CLI, so it names the provider and stays muted.
 */
export function sessionRowStatus(
  readiness: SessionRowReadiness,
  agent: SessionRowAgent,
  t: TFunction,
): SemanticSupporting | undefined {
  switch (readiness) {
    case 'ready':
      return undefined;
    case 'requiresAttention':
      return {
        text: t('sessions.list.statusAttention'),
        tone: 'attention',
        icon: 'triangle-alert',
      };
    case 'busy':
      return {
        text: t('sessions.list.statusActive'),
        tone: 'info',
        icon: 'loader',
        iconClassName: 'animate-spin',
      };
    case 'authenticationRequired':
      return {
        text: t('sessions.list.statusAuthentication', { provider: sessionProviderName(agent) }),
        textClassName: 'text-content-muted',
      };
    case 'unavailable':
      return { text: t('sessions.list.statusUnknown'), textClassName: 'text-content-muted' };
  }
}
