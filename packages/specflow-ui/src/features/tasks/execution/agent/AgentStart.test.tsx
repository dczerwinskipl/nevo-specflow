// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentOption, AgentStepExecutionCheck } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import { managedProviders } from '../../../sessions/start/catalogue/providerDescriptors.stories-support';
import { fakeTaskAuthoringApi } from '../../authoring/authoring.test-support';
import type { WorkflowExecutionApi } from '../api';
import { SPEC, TASK, taskWorkflowProjection } from '../projections.stories-support';
import { refusal } from '../ProjectWorkflowExecution.stories-support';
import { ApiError } from '../../../../api';
import { agentOptions, ownerWorkOption } from './agentStart.stories-support';
import { WorkflowNow } from '../WorkflowNow';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);
const checkOf = (agent: AgentOption): AgentStepExecutionCheck => ({
  position: { step: 'implement' },
  agent,
});

function renderNow(
  projected: AgentOption,
  api: Pick<WorkflowExecutionApi, 'checkAgentExecution' | 'startAgentExecution'>,
  claudeReady = true,
  scenario: 'ready-agent' | 'hand-agent' = 'ready-agent',
) {
  stubLayoutApis();
  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    taskAuthoringApi: fakeTaskAuthoringApi(),
    managedSessionsApi: {
      ...defaults.managedSessionsApi,
      providers: () =>
        Promise.resolve({
          items: claudeReady
            ? managedProviders
            : managedProviders.map((provider) =>
                provider.providerId === 'claude'
                  ? { ...provider, readiness: 'authenticationRequired' as const }
                  : provider,
              ),
        }),
    },
    workflowExecutionApi: {
      start: vi.fn(never),
      finish: vi.fn(never),
      returnTo: vi.fn(never),
      reevaluateWait: vi.fn(never),
      abandon: vi.fn(never),
      stopAgentExecution: vi.fn(never),
      retryAttemptCommit: vi.fn(never),
      confirmResult: vi.fn(never),
      takeOverAgentExecution: vi.fn(never),
      history: vi.fn(never),
      rejectResult: vi.fn(never),
      closePreview: vi.fn(never),
      closeOccupancy: vi.fn(never),
      close: vi.fn(never),
      ...api,
    },
  });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <WorkflowNow
            subject={{ specId: SPEC, taskId: TASK }}
            projection={taskWorkflowProjection(scenario, { agent: projected })}
            headingId="now"
            links={{}}
            artifactOptions={[]}
          />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Run with agent' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).queryByText(/Checking whether/)).toBeNull());

  return dialog;
}

const footerOf = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!).getAllByRole(
    'button',
  );

describe('Run with agent entry', () => {
  it('offers the manual start as the main action and Run with agent beside it', () => {
    renderNow(agentOptions.fresh, { checkAgentExecution: never, startAgentExecution: never });

    const actions = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label === 'Start Implementation' || label === 'Run with agent');
    expect(actions).toEqual(['Start Implementation', 'Run with agent']);
  });

  it('stays offered when the agent is unavailable, so its dialog can explain why', () => {
    renderNow(agentOptions['no-agent'], {
      checkAgentExecution: never,
      startAgentExecution: never,
    });

    expect(screen.getByRole('button', { name: 'Run with agent' })).toBeTruthy();
  });

  it('is omitted when the step is not an agent step', () => {
    renderNow(
      { kind: 'unavailable', reason: 'not-an-executor' },
      { checkAgentExecution: never, startAgentExecution: never },
    );

    expect(screen.queryByRole('button', { name: 'Run with agent' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Implementation' })).toBeTruthy();
  });
});

describe('Run with agent dialog', () => {
  it('reads the check when it opens and starts a new Session with the chosen agent', async () => {
    const check = vi.fn(() => Promise.resolve(checkOf(agentOptions.fresh)));
    const startAgent = vi.fn(() =>
      Promise.resolve({
        kind: 'started' as const,
        subject: { kind: 'task' as const, specId: SPEC, taskId: TASK },
        attemptId: 'a1',
        step: 'implement',
        attempt: 2,
        sessionId: 's1',
        turnId: 't1',
        session: 'fresh' as const,
      }),
    );
    renderNow(agentOptions.fresh, { checkAgentExecution: check, startAgentExecution: startAgent });
    expect(check).not.toHaveBeenCalled();

    const dialog = await openDialog();
    expect(check).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('Run with agent: Implementation')).toBeTruthy();
    expect(within(dialog).getByText('New session')).toBeTruthy();
    expect(within(dialog).getByText(/commits its work on/)).toBeTruthy();
    const radio = await within(dialog).findByRole('radio', { name: /Claude/ });
    expect((radio as HTMLInputElement).checked).toBe(true);
    expect(footerOf(dialog).map((button) => button.textContent)).toEqual([
      'Cancel',
      'Run with agent',
    ]);

    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(1));
    const [subject, body] = startAgent.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(subject).toEqual({ specId: SPEC, taskId: TASK });
    expect(body).toMatchObject({
      expected: { step: 'implement' },
      provider: 'claude',
      model: 'claude-sonnet',
      effort: 'high',
    });
    expect(typeof body.requestId).toBe('string');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('continues the earlier Session in its own work mode: no picker, nothing but the step is sent', async () => {
    const startAgent = vi.fn(never);
    const reuse = {
      ...agentOptions.reuse,
      workMode: { providerModeId: 'manual', title: 'Manual' },
    };
    renderNow(reuse, {
      checkAgentExecution: () => Promise.resolve(checkOf(reuse)),
      startAgentExecution: startAgent,
    });

    const dialog = await openDialog();
    expect(within(dialog).getByText('Continues')).toBeTruthy();
    expect(within(dialog).getByText('The agent works in the Manual mode.')).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(1));
    const body = (startAgent.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(body.provider).toBeUndefined();
    expect(body.model).toBeUndefined();
  });

  it('says an independent step always starts in a new Session', async () => {
    renderNow(agentOptions.independent, {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions.independent)),
      startAgentExecution: never,
    });

    const dialog = await openDialog();
    expect(await within(dialog).findByText(/done independently/)).toBeTruthy();
    expect(within(dialog).getByText(/Reviewer agent settings/)).toBeTruthy();
  });

  it('lists the changed files, with Check again inside the alert and a disabled primary', async () => {
    const check = vi
      .fn<WorkflowExecutionApi['checkAgentExecution']>()
      .mockResolvedValueOnce(checkOf(agentOptions.dirty))
      .mockResolvedValueOnce(checkOf(agentOptions.fresh));
    renderNow(agentOptions.fresh, { checkAgentExecution: check, startAgentExecution: never });

    const dialog = await openDialog();
    const alert = within(dialog)
      .getByText('Commit or undo these changes first')
      .closest<HTMLElement>('[role=status]')!;
    expect(within(alert).getByText('scratch-notes.txt')).toBeTruthy();
    expect(within(alert).getByText('src/auth/refresh.ts')).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    expect(footerOf(dialog)).toHaveLength(2);

    fireEvent.click(within(alert).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(dialog).queryByText('Commit or undo these changes first')).toBeNull(),
    );
    await waitFor(() => expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(false));
  });

  it('says the project names no agent, never a preselected picker', async () => {
    renderNow(agentOptions['no-agent'], {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions['no-agent'])),
      startAgentExecution: never,
    });

    const dialog = await openDialog();
    expect(within(dialog).getByText('No agent is chosen for Implementation')).toBeTruthy();
    expect(within(dialog).getByText('Agent and model not chosen')).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the agent that is not ready; a ready one may be picked for a new Session', async () => {
    renderNow(
      agentOptions.fresh,
      {
        checkAgentExecution: () => Promise.resolve(checkOf(agentOptions['provider-not-ready'])),
        startAgentExecution: never,
      },
      false,
    );

    const dialog = await openDialog();
    expect(within(dialog).getByText(/not signed in on this machine/)).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Codex/ }));
    await waitFor(() => expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(false));
  });

  it('keeps a continued Session blocked while its agent is not ready', async () => {
    const reuse = {
      ...agentOptions['provider-not-ready'],
      launch: agentOptions.reuse.launch,
    } as AgentOption;
    renderNow(
      agentOptions.reuse,
      {
        checkAgentExecution: () => Promise.resolve(checkOf(reuse)),
        startAgentExecution: never,
      },
      false,
    );

    const dialog = await openDialog();
    expect(within(dialog).getByText(/not signed in on this machine/)).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('says the Session to continue is gone and starts no other', async () => {
    renderNow(agentOptions['session-gone'], {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions['session-gone'])),
      startAgentExecution: never,
    });

    const dialog = await openDialog();
    expect(within(dialog).getByText('The session to continue is gone')).toBeTruthy();
    expect(within(dialog).getByText('This session no longer exists.')).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains a refusal on submit with the same blocker, as an alert', async () => {
    renderNow(agentOptions.fresh, {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions.fresh)),
      startAgentExecution: () =>
        Promise.reject(
          refusal('WORKFLOW_AGENT_UNAVAILABLE', { details: { agent: agentOptions.dirty } }),
        ),
    });

    const dialog = await openDialog();
    fireEvent.click(footerOf(dialog)[1]!);
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('Commit or undo these changes first')).toBeTruthy();
    expect(within(alert).getByText('scratch-notes.txt')).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(alert).getByRole('button', { name: 'Check again' }),
      ),
    );
  });

  it('treats a model the agent does not offer as not chosen, never naming its id', async () => {
    const startAgent = vi.fn(never);
    renderNow(agentOptions['model-not-offered'], {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions['model-not-offered'])),
      startAgentExecution: startAgent,
    });

    const dialog = await openDialog();
    const trigger = await within(dialog).findByRole('button', { name: /Choose a model/ });
    expect(within(dialog).getByText(/No model Claude offers is set/)).toBeTruthy();
    expect(within(dialog).queryByText(/\bsonnet\b/)).toBeNull();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Claude Sonnet/ }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(false));
    // The owner chose the model: nothing in the dialog calls it preselected from the settings.
    expect(within(dialog).queryByText(/Preselected from/)).toBeNull();
    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() =>
      expect(startAgent).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        // The agent settings' effort stays for the picked model, never the list's first (low).
        expect.objectContaining({ provider: 'claude', model: 'claude-sonnet', effort: 'high' }),
      ),
    );
  });

  it('says a refused start even when another agent could be picked', async () => {
    renderNow(agentOptions.fresh, {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions.fresh)),
      startAgentExecution: () =>
        Promise.reject(
          refusal('WORKFLOW_AGENT_UNAVAILABLE', {
            details: {
              agent: {
                kind: 'unavailable',
                reason: 'provider-not-ready',
                launch: agentOptions.fresh.launch,
              },
            },
          }),
        ),
    });

    const dialog = await openDialog();
    await within(dialog).findByRole('radio', { name: /Claude/ });
    fireEvent.click(footerOf(dialog)[1]!);
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('The agent is not ready')).toBeTruthy();
    expect(within(alert).getByText(/SpecFlow did not start the agent/)).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    // Another choice is a new start: the refusal of the earlier one no longer blocks it.
    fireEvent.click(within(dialog).getByRole('radio', { name: /Codex/ }));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('retries a lost answer with the same request, and resolves it before another choice', async () => {
    const lostAnswer = new ApiError({
      kind: 'network',
      operation: 'workflow.agent-execution',
      outcome: 'unknown',
      retryable: true,
    });
    let attemptStarted = false;
    const check = vi.fn(() =>
      Promise.resolve(
        attemptStarted
          ? { position: { step: 'implement', attempt: 2 }, agent: agentOptions.fresh }
          : checkOf(agentOptions.fresh),
      ),
    );
    const startAgent = vi.fn<WorkflowExecutionApi['startAgentExecution']>(() =>
      Promise.reject(lostAnswer),
    );
    renderNow(agentOptions.fresh, { checkAgentExecution: check, startAgentExecution: startAgent });
    const bodies = () => startAgent.mock.calls.map(([, body]) => body);

    const dialog = await openDialog();
    await within(dialog).findByRole('radio', { name: /Claude/ });
    fireEvent.click(footerOf(dialog)[1]!);
    await within(dialog).findByText(/The answer was lost/);

    // The same choice resends exactly the first request.
    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toEqual(bodies()[0]);
    await within(dialog).findByText(/The answer was lost/);

    // Another model: the earlier request is resolved first; it started the attempt, so that one is
    // shown and nothing else is sent, never the old id with the new model.
    attemptStarted = true;
    fireEvent.click(within(dialog).getByRole('radio', { name: /Codex/ }));
    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(startAgent).toHaveBeenCalledTimes(2);
  });

  it('starts a new request for another choice when the lost one started nothing', async () => {
    const lostAnswer = new ApiError({
      kind: 'network',
      operation: 'workflow.agent-execution',
      outcome: 'unknown',
      retryable: true,
    });
    const startAgent = vi.fn<WorkflowExecutionApi['startAgentExecution']>(() =>
      Promise.reject(lostAnswer),
    );
    renderNow(agentOptions.fresh, {
      checkAgentExecution: () => Promise.resolve(checkOf(agentOptions.fresh)),
      startAgentExecution: startAgent,
    });

    const dialog = await openDialog();
    await within(dialog).findByRole('radio', { name: /Claude/ });
    fireEvent.click(footerOf(dialog)[1]!);
    await within(dialog).findByText(/The answer was lost/);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Codex/ }));
    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(2));

    const [first, second] = startAgent.mock.calls.map(([, body]) => body);
    expect(second?.provider).toBe('codex');
    expect(second?.requestId).not.toBe(first?.requestId);
  });

  it('explains a check that failed, with Check again inside the alert', async () => {
    renderNow(agentOptions.fresh, {
      checkAgentExecution: () => Promise.reject(new Error('offline')),
      startAgentExecution: never,
    });

    const dialog = await openDialog();
    const alert = within(dialog).getByRole('alert');
    expect(within(alert).getByText('SpecFlow could not check the agent')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Hand to agent', () => {
  const handCheck = (agent: AgentOption): AgentStepExecutionCheck => ({
    position: { step: 'implement', attempt: 2, handOver: true },
    agent,
  });
  const renderHand = (
    projected: AgentOption,
    api: Pick<WorkflowExecutionApi, 'checkAgentExecution' | 'startAgentExecution'>,
  ) => renderNow(projected, api, true, 'hand-agent');

  it("is the secondary beside Finish step on the owner's attempt, and the who-acts line says so", () => {
    renderHand(agentOptions.fresh, { checkAgentExecution: never, startAgentExecution: never });

    const actions = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label === 'Finish step' || label === 'Hand to agent');
    expect(actions).toEqual(['Finish step', 'Hand to agent']);
    expect(screen.getByText(/or hand it to the agent to go on/)).toBeTruthy();
  });

  it("ends the owner's attempt it was opened for and starts the agent's", async () => {
    const startAgent = vi.fn(never);
    renderHand(agentOptions.fresh, {
      checkAgentExecution: () => Promise.resolve(handCheck(agentOptions.fresh)),
      startAgentExecution: startAgent,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hand to agent' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByText(/Checking whether/)).toBeNull());
    expect(within(dialog).getByText('Hand to agent: Implementation')).toBeTruthy();
    expect(within(dialog).getByText(/Your attempt 2 of this step/)).toBeTruthy();
    expect(footerOf(dialog).map((button) => button.textContent)).toEqual([
      'Cancel',
      'Hand to agent',
    ]);
    await within(dialog).findByRole('radio', { name: /Claude/ });

    fireEvent.click(footerOf(dialog)[1]!);
    await waitFor(() => expect(startAgent).toHaveBeenCalledTimes(1));
    const body = (startAgent.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(body).toMatchObject({
      expected: { step: 'implement', attempt: 2, handOver: true },
      provider: 'claude',
    });
  });

  it("names the owner's uncommitted work before anything is sent", async () => {
    const startAgent = vi.fn(never);
    renderHand(agentOptions.fresh, {
      checkAgentExecution: () => Promise.resolve(handCheck(ownerWorkOption)),
      startAgentExecution: startAgent,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hand to agent' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Commit or undo your changes first')).toBeTruthy();
    expect(within(dialog).getByText('src/auth/refresh.ts')).toBeTruthy();
    expect((footerOf(dialog)[1] as HTMLButtonElement).disabled).toBe(true);
    expect(startAgent).not.toHaveBeenCalled();
  });
});
