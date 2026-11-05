import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';

type ProviderModes = Pick<ProviderDescriptor, 'providerModes' | 'defaultModeId'>;

/**
 * Story/test fixtures for each provider's own work-mode catalogue (`ProviderDescriptor.providerModes`).
 * The Runtime is the source of truth for which modes exist and what they are called, so every
 * provider here speaks its own vocabulary — the UI only lists what the catalogue says.
 */
export const providerModeFixtures = {
  /** Claude Code's native permission modes (titles as the Runtime's Claude driver reports them). */
  claude: {
    defaultModeId: 'acceptEdits',
    providerModes: [
      {
        modeId: 'plan',
        title: 'Plan',
        nativeMode: 'plan',
        mode: 'read-only',
        readiness: 'ready',
      },
      {
        modeId: 'acceptEdits',
        title: 'Accept edits',
        nativeMode: 'acceptEdits',
        mode: 'workspace-write',
        readiness: 'ready',
      },
      {
        modeId: 'manual',
        title: 'Manual',
        nativeMode: 'default',
        mode: 'workspace-write',
        readiness: 'ready',
      },
      {
        modeId: 'dontAsk',
        title: "Don't ask",
        nativeMode: 'dontAsk',
        mode: 'workspace-write',
        readiness: 'unavailable',
        reason: 'The installed Claude could not initialize this native mode.',
      },
    ],
  },
  /** A Codex-like provider: Agent and Plan. */
  mock: {
    defaultModeId: 'default',
    providerModes: [
      {
        modeId: 'default',
        title: 'Agent',
        nativeMode: 'default',
        mode: 'workspace-write',
        readiness: 'ready',
      },
      { modeId: 'plan', title: 'Plan', nativeMode: 'plan', mode: 'read-only', readiness: 'ready' },
    ],
  },
  /** A Cursor-like provider: Ask, Plan and Agent; Agent not authorized for this actor. */
  cursor: {
    defaultModeId: 'ask',
    providerModes: [
      { modeId: 'ask', title: 'Ask', nativeMode: 'ask', mode: 'read-only', readiness: 'ready' },
      { modeId: 'plan', title: 'Plan', nativeMode: 'plan', mode: 'read-only', readiness: 'ready' },
      {
        modeId: 'agent',
        title: 'Agent',
        nativeMode: 'agent',
        mode: 'workspace-write',
        readiness: 'ready',
        authorized: false,
      },
    ],
  },
} satisfies Record<string, ProviderModes>;

export function providerModesFixture(providerId: string): ProviderModes {
  return (providerModeFixtures as Record<string, ProviderModes>)[providerId] ?? {};
}
