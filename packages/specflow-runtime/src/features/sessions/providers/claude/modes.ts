import type { Invocation } from '../driver';
import { SessionError } from '../../errors';

export const claudeReadTools = ['Read', 'Glob', 'Grep', 'AskUserQuestion'] as const;
export const claudeAgentTools = [...claudeReadTools, 'Edit', 'Write', 'Bash'] as const;
export const claudeModes = [
  {
    modeId: 'acceptEdits',
    nativeMode: 'acceptEdits',
    title: 'Accept edits',
    mode: 'workspace-write',
  },
  { modeId: 'auto', nativeMode: 'auto', title: 'Auto', mode: 'workspace-write' },
  // The CLI accepts manual; the wire protocol reports its canonical name default.
  { modeId: 'manual', nativeMode: 'default', title: 'Manual', mode: 'workspace-write' },
  { modeId: 'dontAsk', nativeMode: 'dontAsk', title: "Don't ask", mode: 'workspace-write' },
  { modeId: 'plan', nativeMode: 'plan', title: 'Plan', mode: 'read-only' },
] as const;
export type ClaudeMode = (typeof claudeModes)[number];
export function claudeMode(selection?: Invocation['selection']): ClaudeMode {
  // A writable Turn without an explicit native mode (agent step execution) runs in acceptEdits.
  const id =
    selection?.providerModeId ?? (selection?.mode === 'workspace-write' ? 'acceptEdits' : 'plan');
  const mode = claudeModes.find((mode) => mode.modeId === id);
  if (!mode || (selection && mode.mode !== selection.mode)) {
    throw new SessionError(
      'CAPABILITY_UNSUPPORTED',
      'Select a supported native Claude mode with matching effect authority.',
    );
  }

  return mode;
}

export function toolsForClaudeMode(mode: ClaudeMode): readonly string[] {
  return mode.mode === 'read-only' ? claudeReadTools : claudeAgentTools;
}
