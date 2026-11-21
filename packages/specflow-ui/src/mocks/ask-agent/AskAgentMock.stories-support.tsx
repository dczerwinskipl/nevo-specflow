import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InformationList, InlineNote } from '@nevo/ui';
import { NowBlock } from '../../features/tasks/execution/NowBlock';
import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { InlineAction } from '../../features/tasks/execution/InlineAction';
import { specificationWorkflowProjection } from '../../features/tasks/execution/projections.stories-support';
import { SessionProviderIcon } from '../../features/sessions/shared/SessionProviderIcon';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { OperationalRow } from '../../shared/operational-list';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/workflow-execution.md,
 * "Run with agent"). What is left of the mock after the rest was built for real: the notice on
 * another subject while an agent's outcome is unknown (state 15), which waits for the Runtime to
 * report the project-wide hold (`projectHold`). The real routed Specification Overview with its Now
 * block and Sessions section replaced; static data, no commands.
 */

const noop = () => undefined;

function OtherSubjectBlocked() {
  return (
    <NowBlock
      projection={specificationWorkflowProjection('waiting')}
      headingId="now-mock"
      links={{}}
      showHandoff={false}
      note={
        <InlineNote tone="attention" role="alert">
          <span className="font-medium text-content-primary">
            Nothing can be saved in this project right now.
          </span>{' '}
          SpecFlow cannot tell whether the agent working on t-04 is still running. Open t-04 to
          check its outcome.{' '}
          <InlineAction className="text-body-sm" onClick={noop}>
            Open t-04
          </InlineAction>
        </InlineNote>
      }
    />
  );
}

/** The Overview's Sessions section with the agent's Session whose state is unknown. */
function UnknownSession() {
  return (
    <InformationList>
      <OperationalRow
        leading={<SessionProviderIcon providerId="claude" />}
        primary="Implement token exchange"
        onPrimaryClick={noop}
        factsLayout="inline"
        compactFacts={['Nov 13', 'Claude Sonnet 5', '1 task']}
        supporting={{ text: 'Session state unknown', textClassName: 'text-content-muted' }}
      />
    </InformationList>
  );
}

/** The deepest element whose text contains every one of `parts`, outside the mock's own. */
function findDeepest(...parts: readonly string[]) {
  return () => {
    const matches = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(
      (element) =>
        !element.closest('[data-mock-replacement]') &&
        parts.every((part) => (element.textContent ?? '').includes(part)),
    );
    let found = matches.find(
      (element) =>
        !Array.from(element.children).some((child) => matches.includes(child as HTMLElement)),
    );
    while (
      found?.parentElement &&
      (found.parentElement.textContent ?? '').trim() === (found.textContent ?? '').trim()
    ) {
      found = found.parentElement;
    }

    return found;
  };
}

const findNow = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-now]')).find(
    (element) => !element.closest('[data-mock-replacement]'),
  );
const findNoSessions = findDeepest('This specification has no sessions yet.');

/** Renders `children` in place of the element `find` returns, inside the real screen. */
function Replace({
  find,
  children,
}: {
  readonly find: () => HTMLElement | null | undefined;
  readonly children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let created: HTMLElement | null = null;
    const tick = () => {
      const target = find();
      if (!target) {
        return;
      }

      target.style.display = 'none';
      if (!created || !created.isConnected || created.nextElementSibling !== target) {
        created?.remove();
        created = document.createElement('div');
        created.setAttribute('data-mock-replacement', '');
        target.parentElement?.insertBefore(created, target);
        setHost(created);
      }
    };

    tick();
    const timer = window.setInterval(tick, 150);

    return () => {
      window.clearInterval(timer);
      created?.remove();
    };
  }, [find]);

  return host ? createPortal(<StoryLocalization>{children}</StoryLocalization>, host) : null;
}

export function AskAgentMock() {
  return (
    <>
      <WorkflowExecutionFixture scenario="waiting" />
      <Replace find={findNow}>
        <OtherSubjectBlocked />
      </Replace>
      <Replace find={findNoSessions}>
        <UnknownSession />
      </Replace>
    </>
  );
}
