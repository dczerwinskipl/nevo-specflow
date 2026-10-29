import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeArguments, claudeModels, verifyClaudeInit } from './discovery';

describe('Claude native launch contract', () => {
  it('compares the manual CLI alias against its canonical default protocol mode without accepting escalation', () => {
    const selection = {
      providerId: 'claude',
      mode: 'workspace-write' as const,
      providerModeId: 'manual',
    };
    const workspace = resolve('workspace');
    expect(claudeArguments(selection)).toContain('manual');
    const frame = {
      type: 'system',
      subtype: 'init',
      cwd: workspace,
      permissionMode: 'default',
      tools: ['Read', 'Glob', 'Grep', 'AskUserQuestion', 'Edit', 'Write', 'Bash'],
      mcp_servers: [],
    };
    expect(() => verifyClaudeInit(frame, workspace, undefined, selection)).not.toThrow();
    expect(() =>
      verifyClaudeInit(
        { ...frame, permissionMode: 'bypassPermissions' },
        workspace,
        undefined,
        selection,
      ),
    ).toThrow();
    expect(() =>
      verifyClaudeInit(frame, workspace, undefined, {
        ...selection,
        providerModeId: 'acceptEdits',
      }),
    ).toThrow();
  });
  it('uses exact native context without resume-to-new fallback and fixes effect restrictions', () => {
    const nativeSessionId = randomUUID();
    const fresh = claudeArguments(
      { providerId: 'claude', mode: 'read-only', modelId: 'haiku', effort: 'low' },
      { nativeSessionId, resume: false },
    );
    expect(fresh).toContain('--safe-mode');
    expect(fresh).toContain('--restricted');
    expect(fresh).toContain('Read,Glob,Grep,AskUserQuestion');
    expect(fresh).toContain('--session-id');
    expect(fresh).not.toContain('--resume');
    const resume = claudeArguments(undefined, { nativeSessionId, resume: true });
    expect(resume).toContain('--resume');
    expect(resume).not.toContain('--session-id');
    expect(resume).not.toContain('--continue');
    expect(resume).not.toContain('--bare');
    expect(resume).toContain('stdio');
    expect(resume).toContain('{"disableAllHooks":true}');
  });
  it('uses native model/effort metadata and refuses changed version or ambiguous models', () => {
    const payload = {
      claude_code_version: '2.1.296',
      models: [
        {
          value: 'default',
          displayName: 'Native default',
          supportsEffort: true,
          supportedEffortLevels: ['low', 'high'],
        },
      ],
    };
    expect(claudeModels(payload)).toEqual([
      { modelId: 'default', title: 'Native default', efforts: ['low', 'high'] },
    ]);
    expect(claudeModels({ ...payload, claude_code_version: '9.0.0' })).toEqual(
      claudeModels(payload),
    );
    expect(() =>
      claudeModels({ ...payload, models: [...payload.models, ...payload.models] }),
    ).toThrow();
  });
  it('accepts only the observed builtin plugins and explicit read tools, never arbitrary plugins/MCP or mode escalation', () => {
    const workspace = resolve('workspace');
    const frame = {
      type: 'system',
      subtype: 'init',
      claude_code_version: '2.1.296',
      cwd: workspace,
      permissionMode: 'plan',
      tools: ['Read', 'Glob', 'Grep', 'AskUserQuestion'],
      mcp_servers: [],
      plugins: [
        { name: 'cc-plugin-telemetry', path: 'builtin', source: 'cc-plugin-telemetry@builtin' },
      ],
    };
    expect(() => verifyClaudeInit(frame, workspace)).not.toThrow();
    for (const changed of [
      { tools: ['Bash'] },
      { permissionMode: 'bypassPermissions' },
      { mcp_servers: [{}] },
      {
        plugins: [
          { name: 'cc-plugin-telemetry', path: '/external', source: 'cc-plugin-telemetry@builtin' },
        ],
      },
      { plugins: [{ name: 'unknown', path: 'builtin', source: 'unknown@builtin' }] },
    ]) {
      expect(() => verifyClaudeInit({ ...frame, ...changed }, workspace)).toThrow();
    }
  });
});
