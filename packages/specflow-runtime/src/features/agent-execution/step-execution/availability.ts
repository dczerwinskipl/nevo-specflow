import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { AgentLaunch, AgentOption } from '@nevo/specflow-engine';

/**
 * What the Runtime knows about starting an agent now, beyond the definitions (explain before
 * action). Read by `facts.ts`; judged here, purely.
 */
export interface AgentRuntimeFacts {
  /** The demo Runtime runs no agent. */
  readonly demo?: boolean;
  /** Managed Sessions with write support are enabled in this Runtime. */
  readonly sessions: boolean;
  /** The readiness of the launch's provider; absent when the option has no launch. */
  readonly provider?: { readonly ready: boolean; readonly detail?: string };
  /** Another writer holds the project (an unsettled agent Turn, a Create or Close). */
  readonly busy?: { readonly detail: string };
  /**
   * The checkout's baseline refuses the Turn, with the paths it names (`owner-work-uncommitted`:
   * Hand to agent, the owner's uncommitted work).
   */
  readonly baseline?: {
    readonly reason: 'dirty-baseline' | 'baseline-changed' | 'owner-work-uncommitted';
    /** What changed and the remedy, in plain words. */
    readonly detail?: string;
    readonly paths: readonly string[];
    readonly count: number;
  };
}

type Unavailable = Extract<AgentOption, { kind: 'unavailable' }>;
type Available = Extract<AgentOption, { kind: 'available' }>;

const launchOf = (option: AgentOption): Pick<Unavailable, 'launch' | 'independent'> =>
  option.kind === 'available'
    ? { launch: option.launch, ...(option.independent ? { independent: true as const } : {}) }
    : {};

/**
 * The agent option with the Runtime's reasons applied, in the order an owner resolves them: what the
 * definitions say first (unchanged), then the demo, a provider that cannot run, another writer, and
 * the checkout's baseline. The launch stays on an unavailable option, so the dialog can show which
 * agent would run once the blocker is resolved.
 */
export function withRuntimeReasons(option: AgentOption, facts: AgentRuntimeFacts): AgentOption {
  if (option.kind === 'unavailable') {
    return option;
  }

  const unavailable = (reason: Unavailable['reason'], extra: Partial<Unavailable> = {}) =>
    ({ kind: 'unavailable', reason, ...extra, ...launchOf(option) }) as Unavailable;
  if (facts.demo) {
    return unavailable('demo', { detail: 'The demo runs no agent.' });
  }

  if (!facts.sessions) {
    return unavailable('provider-not-ready', {
      detail: 'Managed agent Sessions are not enabled in this Runtime.',
    });
  }

  if (facts.provider && !facts.provider.ready) {
    return unavailable('provider-not-ready', {
      detail: facts.provider.detail ?? `The provider ${option.launch.provider} is not ready.`,
    });
  }

  if (facts.busy) {
    return unavailable('project-busy', { detail: facts.busy.detail });
  }

  if (facts.baseline) {
    return unavailable(facts.baseline.reason, {
      ...(facts.baseline.detail ? { detail: facts.baseline.detail } : {}),
      paths: facts.baseline.paths,
      count: facts.baseline.count,
    });
  }

  return option;
}

/**
 * A fresh launch's configured model as the provider offers it: by its id, or else by the entry that
 * runs it (an alias, `resolvedModelId`; not the provider's `default`, which may change), whose id
 * the launch then carries, its effort kept while that entry offers it. A model the provider does
 * not offer at all is no model: the owner picks one of the provider's own (`modelRequired`) and the
 * unknown id is never passed on. `offered`: the provider's models; absent or empty when it has not
 * listed them yet (not judged).
 */
export function withOfferedModel(
  option: Available,
  offered:
    | readonly Pick<
        ProviderDescriptor['models'][number],
        'modelId' | 'efforts' | 'resolvedModelId'
      >[]
    | undefined,
): Available {
  const configured = option.launch.model;
  if (
    option.launch.session.mode !== 'fresh' ||
    !configured ||
    !offered?.length ||
    offered.some((model) => model.modelId === configured)
  ) {
    return option;
  }

  const { effort, ...launch } = option.launch;
  const alias = offered.find(
    (model) => model.modelId !== 'default' && model.resolvedModelId === configured,
  );
  if (alias) {
    return {
      ...option,
      launch: {
        ...launch,
        model: alias.modelId,
        ...(effort !== undefined && alias.efforts.includes(effort) ? { effort } : {}),
      },
    };
  }

  // The configured effort stays as the suggestion for the model the owner picks.
  return { ...option, launch: { ...option.launch, model: '' }, modelRequired: true };
}

/**
 * The provider mode a continued Session runs in: its own `providerModeId` under the catalogue's
 * title, so Run with agent and Continue name it as the Session does; `undefined` when the Session has
 * none or the catalogue no longer lists it (its id is never shown as a title).
 */
export function sessionWorkMode(
  provider: Pick<ProviderDescriptor, 'providerModes'> | undefined,
  providerModeId: string | undefined,
): { readonly providerModeId: string; readonly title: string } | undefined {
  const mode = provider?.providerModes?.find((candidate) => candidate.modeId === providerModeId);

  return mode ? { providerModeId: mode.modeId, title: mode.title } : undefined;
}

/** The provider, model and effort a start uses: the owner's choice only for a fresh Session (D18). */
export function chosenLaunch(
  launch: AgentLaunch,
  choice: { readonly provider?: string; readonly model?: string; readonly effort?: string },
): AgentLaunch | 'not-for-a-continued-session' {
  if (choice.provider === undefined && choice.model === undefined && choice.effort === undefined) {
    return launch;
  }

  if (launch.session.mode !== 'fresh') {
    return 'not-for-a-continued-session';
  }

  const provider = choice.provider ?? launch.provider;
  const { effort: _effort, ...rest } = launch;
  const effort = choice.effort ?? (provider === launch.provider ? launch.effort : undefined);

  return {
    ...rest,
    provider,
    // Another provider has none of this one's models: it needs its own.
    model: choice.model ?? (provider === launch.provider ? launch.model : ''),
    ...(effort !== undefined ? { effort } : {}),
  };
}
