import { useEffect } from 'react';
import { consumeStartFocus } from './startedSession';

/**
 * A Session just started here is opened to be written in: once its Composer is active, the message
 * field takes focus (full-session.md "Starting a Session"). One time per start; a Session opened
 * any other way keeps the browser's own focus.
 */
export function useFocusStartedComposer(
  owner: string,
  sessionId: string,
  composerActive: boolean,
): void {
  useEffect(() => {
    if (composerActive && consumeStartFocus(owner, sessionId)) {
      document.getElementById('managed-message')?.focus();
    }
  }, [owner, sessionId, composerActive]);
}
