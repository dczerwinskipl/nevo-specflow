// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Interaction } from '@nevo/specflow-contracts/sessions';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { InteractionPrompt } from './InteractionPrompt';

afterEach(cleanup);

describe('command execution permission', () => {
  it.each(['host-execution', 'workspace-write'] as const)(
    'shows the exact command, directory and %s authority before approval',
    (authority) => {
      const onRespond = vi.fn();
      const interaction: Interaction = {
        interactionId: 'permission-1',
        turnId: 'turn-1',
        workId: 'work-1',
        revision: 1,
        kind: 'permission',
        prompt: 'Allow this operation?',
        actionSummary: 'Legacy summary',
        action: {
          operation: 'command',
          command: 'echo controlled\necho second line',
          cwd: 'src/tools',
          authority,
          approval: 'once',
        },
      };
      render(
        <StoryLocalization locale="en">
          <InteractionPrompt interaction={interaction} busy={false} onRespond={onRespond} />
        </StoryLocalization>,
      );
      expect(screen.getByText('Directory relative to the workspace: src/tools')).toBeTruthy();
      expect(screen.getByText(/echo controlled/).tagName).toBe('PRE');
      expect(screen.getByText(/echo controlled/).textContent).toBe(interaction.action!.command);
      expect(
        screen.getByText(
          authority === 'host-execution'
            ? /It may change files outside the workspace/
            : /permission for this command within the workspace/,
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
      expect(onRespond).toHaveBeenCalledExactlyOnceWith({ kind: 'permission', decision: 'allow' });
    },
  );
});

function question(
  overrides: Partial<Extract<Interaction, { kind: 'question' }>> = {},
): Interaction {
  return {
    interactionId: 'question-1',
    turnId: 'turn-1',
    workId: 'work-1',
    revision: 1,
    kind: 'question',
    prompt: 'Which areas?',
    allowText: false,
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    ...overrides,
  };
}

function renderPrompt(interaction: Interaction, busy = false) {
  const onRespond = vi.fn();
  render(
    <StoryLocalization locale="en">
      <InteractionPrompt interaction={interaction} busy={busy} onRespond={onRespond} />
    </StoryLocalization>,
  );

  return onRespond;
}

describe('single-select question', () => {
  it.each([undefined, 1])('answers with one click when maxSelections is %s', (maxSelections) => {
    const onRespond = renderPrompt(question(maxSelections ? { maxSelections } : {}));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({
      kind: 'question',
      answer: { optionIds: ['b'] },
    });
  });

  it('sends free text without options', () => {
    const onRespond = renderPrompt(question({ allowText: true }));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({
      kind: 'question',
      answer: { optionIds: [], text: 'Other' },
    });
  });
});

describe('multi-select question', () => {
  it('caps the selection at maxSelections and sends option IDs once, in declared order', () => {
    const onRespond = renderPrompt(question({ maxSelections: 2 }));
    const respond = screen.getByRole('button', { name: 'Respond' });
    expect(respond).toHaveProperty('disabled', true);
    expect(screen.getByRole('group', { name: 'Which areas?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(screen.getByText('Selected 2 of at most 2.')).toBeTruthy();
    const beta = screen.getByRole('checkbox', { name: 'Beta' });
    // At the cap the box stays focusable but cannot be checked.
    expect(beta.getAttribute('aria-disabled')).toBe('true');
    expect(beta).toHaveProperty('disabled', false);
    fireEvent.click(beta);
    expect(beta.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Selected 2 of at most 2.').getAttribute('aria-live')).toBe('polite');
    // Unchecking frees a slot again.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    expect(screen.getByRole('checkbox', { name: 'Beta' }).getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    fireEvent.click(respond);
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({
      kind: 'question',
      answer: { optionIds: ['a', 'c'] },
    });
  });

  it('includes optional text with the selected options, and accepts text alone', () => {
    const onRespond = renderPrompt(question({ maxSelections: 3, allowText: true }));
    const respond = screen.getByRole('button', { name: 'Respond' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Also docs' } });
    expect(respond).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    fireEvent.click(respond);
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({
      kind: 'question',
      answer: { optionIds: ['b'], text: 'Also docs' },
    });
  });

  it('keeps Respond disabled for blank text and while busy', () => {
    renderPrompt(question({ maxSelections: 2, allowText: true }));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Respond' })).toHaveProperty('disabled', true);
    cleanup();
    renderPrompt(question({ maxSelections: 2 }), true);
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toHaveProperty('disabled', true);
  });
});
