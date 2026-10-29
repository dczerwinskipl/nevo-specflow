import { SessionError } from '../../errors';
import type { Invocation } from '../driver';

export const codexModes = [
  {
    modeId: 'default',
    nativeMode: 'default',
    title: 'Agent',
    mode: 'workspace-write',
    sandbox: 'workspace-write',
    approval: 'on-request',
  },
  {
    modeId: 'plan',
    nativeMode: 'plan',
    title: 'Plan',
    mode: 'read-only',
    sandbox: 'read-only',
    approval: 'never',
  },
] as const;
export type CodexMode = (typeof codexModes)[number];
export function codexMode(selection: Invocation['selection']): CodexMode {
  const id =
    selection.providerModeId ?? (selection.mode === 'workspace-write' ? 'default' : 'plan');
  const mode = codexModes.find((mode) => mode.modeId === id);
  if (mode?.mode !== selection.mode) {
    throw new SessionError(
      'CAPABILITY_UNSUPPORTED',
      'Select a supported native Codex mode with matching effect authority.',
    );
  }

  return mode;
}

export function codexSandbox(workspace: string, mode: CodexMode) {
  return mode.mode === 'workspace-write'
    ? {
        type: 'workspaceWrite' as const,
        writableRoots: [workspace],
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      }
    : { type: 'readOnly' as const, networkAccess: false };
}
