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
      expect(onRespond).toHaveBeenCalledExactlyOnceWith('', undefined, true);
    },
  );
});
