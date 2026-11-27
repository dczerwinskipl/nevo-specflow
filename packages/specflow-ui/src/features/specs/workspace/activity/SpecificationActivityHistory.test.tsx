// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import {
  NEVO_2_SESSIONS,
  nevo2AttemptsHistory,
  specificationAttemptsHistory,
} from '../../../tasks/execution/agent/agentAttempt.stories-support';
import type { ActivityEvent } from '../../read-model/model';
import type { FeedbackRef } from '../../../tasks';
import { SpecificationActivityHistory } from './SpecificationActivityHistory';

afterEach(cleanup);

function renderHistory(
  history: unknown,
  events: readonly ActivityEvent[],
  onOpenFeedback?: (ref: FeedbackRef) => void,
) {
  stubLayoutApis();
  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    workflowExecutionApi: {
      ...defaults.workflowExecutionApi,
      history: () => Promise.resolve(history as WorkflowHistory),
    },
  });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <SpecificationActivityHistory
            specId="sso"
            events={events}
            {...(onOpenFeedback ? { onOpenFeedback } : {})}
          />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

const started = (id: string, title: string, time: string): ActivityEvent => ({
  id: `session-started.${id}`,
  kind: 'session',
  event: 'session_started',
  title,
  description: 'Session started',
  targetId: id,
  time,
});

const pad = (value: number) => String(value).padStart(2, '0');
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const created: ActivityEvent = {
  id: 'specification-created',
  kind: 'info',
  event: 'specification_created',
  title: 'Specification created',
  description: '',
  time: `${String(yesterday.getFullYear())}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`,
};

/** Each timeline entry by its title, with its outcome line when it has one, in order. */
function timeline(): string[] {
  return Array.from(document.querySelectorAll('aside li'))
    .filter((entry) => !entry.parentElement?.closest('li'))
    .map((entry) => {
      const heading = entry.querySelector('[role="heading"]');
      const outcome = entry.querySelector('[data-attempt-outcome]')?.textContent;
      const title = heading?.textContent ?? entry.textContent ?? '';

      return outcome ? `${title} · ${outcome}` : title;
    });
}

describe('the Specification Activity history', () => {
  it('is one chronological timeline of the workflow and the Specification events', async () => {
    const opened: FeedbackRef[] = [];
    renderHistory(
      nevo2AttemptsHistory(),
      [
        ...NEVO_2_SESSIONS.map((session) => started(session.id, session.title, session.at)),
        created,
      ],
      (ref) => opened.push(ref),
    );

    // The owner's Confirm is a line of the attempt it decided, never an entry of its own.
    const decision = await screen.findByText(/^Confirmed by dominikczerwinski · /);
    expect(decision.closest('li')?.querySelector('[data-attempt-outcome]')?.textContent).toBe(
      'Breakdown approved',
    );
    expect(screen.queryByText('Result confirmed')).toBeNull();
    expect(screen.queryByText('Agent attempts')).toBeNull();
    // The Sessions the attempts represent have no "Session started" of their own.
    expect(screen.queryByText('Session started')).toBeNull();
    const entries = timeline();
    expect(entries.slice(0, -1)).toEqual([
      'Review the breakdown · Breakdown approved',
      'Break the solution down · Breakdown proposed',
      'Review the breakdown · Changes requested',
      'Break the solution down · Breakdown proposed',
      'Design the solution · Solution designed',
      expect.stringMatching(/^Design the solution · Taken over by /),
      'Write the Specification · Specification written',
      'Gather requirements · Requirements agreed',
    ]);
    // One day, "Specification created" last in it.
    expect(screen.getAllByText('Yesterday')).toHaveLength(1);
    expect(entries.at(-1)).toContain('Specification created');
    // Who acted: the owner in the time line, the agent as Now names it.
    // (their Confirm says it in its own line, "Confirmed by dominikczerwinski").
    expect(screen.getAllByText(/ · dominikczerwinski · Attempt 2$/)).toHaveLength(1);
    expect(
      Array.from(document.querySelectorAll('[data-attempt-actor] [data-agent-name]')).map((node) =>
        node.getAttribute('aria-label'),
      ),
      // No title recorded or listed for the tool here: its id made readable.
    ).toContain('Claude · Opus 5.5');
    // The elapsed range, never a duration.
    expect(document.body.textContent).not.toMatch(/\d h \d+ min| min ·/);
    // Feedback is never expanded in the timeline: View feedback opens the Feedback view.
    expect(screen.queryByText(/Owner took over after the agent process/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'View feedback' })[4]!);
    expect(opened).toEqual([{ step: 'solution', attempt: 2 }]);
    expect(screen.queryByText(/Owner took over after the agent process/)).toBeNull();
  });

  it('keeps the "Session started" of a Session outside the workflow, at its time', async () => {
    const chatAt = new Date();
    chatAt.setHours(0, 20, 0, 0);
    renderHistory(specificationAttemptsHistory(), [
      started('s-chat', 'Questions about the install matrix', chatAt.toISOString()),
      started('s-plan-1', 'Plan the breakdown', chatAt.toISOString()),
    ]);

    await screen.findByText('Handed to the agent');
    expect(screen.getAllByText('Session started')).toHaveLength(1);
    const entries = timeline();
    const chat = entries.findIndex((entry) => entry.includes('Questions about the install matrix'));
    // Before the Breakdown that started at 00:02, after the review that started at 00:41.
    expect(entries[chat - 1]).toMatch(/^Review the breakdown · Changes requested/);
    expect(entries[chat + 1]).toMatch(/^Break the solution down · Completed/);
  });

  it('shows the empty state only when nothing at all is recorded', async () => {
    const none = { subject: { kind: 'specification', specId: 'sso' }, items: [] };
    const empty = renderHistory(none, []);
    await waitFor(() => expect(screen.getByText('No history for this specification')).toBeTruthy());
    empty.unmount();

    renderHistory(none, [created]);
    expect(await screen.findByText('Specification created')).toBeTruthy();
    expect(screen.queryByText('No history for this specification')).toBeNull();
  });
});
