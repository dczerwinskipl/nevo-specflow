import { useEffect } from 'react';
import { consumeStartFocus } from './startedSession';

/**
 * A Session just started here is opened to be written in: once its Composer is active, the message
 * field takes focus (new-session-ui-spec.md, section 3(c)). One time per start; a Session opened
 * any other way keeps the browser's own focus.
 */
export function useFocusStartedComposer(sessionId: string, composerActive: boolean): void {
  useEffect(() => {
    if (composerActive && consumeStartFocus(sessionId)) {
      document.getElementById('managed-message')?.focus();
    }
  }, [sessionId, composerActive]);
}
