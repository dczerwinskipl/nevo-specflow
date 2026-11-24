import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeArguments, claudeModels, verifyClaudeInit, verifyClaudeStatus } from './discovery';
import { claudeMode } from './modes';

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
    expect(JSON.parse(resume[resume.indexOf('--settings') + 1]!)).toEqual({
      disableAllHooks: true,
      permissions: { ask: ['Bash'] },
      env: { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1' },
    });
  });
  it('keeps the Bash ask and the empty setting sources whatever the allowlist, with only scoped reads native', () => {
    const selection = {
      providerId: 'claude',
      mode: 'workspace-write',
      providerModeId: 'manual',
    } as const;
    const settings = (permissions?: { allow: string[] }) => {
      const args = claudeArguments(selection, undefined, permissions);
      // No owner or project settings are merged: setting sources stay empty next to --settings.
      expect(args[args.indexOf('--setting-sources') + 1]).toBe('');

      return JSON.parse(args[args.indexOf('--settings') + 1]!) as { permissions: unknown };
    };

    expect(
      settings({ allow: ['Read(src/**)', 'Bash(nevo-specflow specs list *)', 'Write', 'Bash'] })
        .permissions,
    ).toEqual({ allow: ['Read(src/**)'], ask: ['Bash'] });
    expect(settings({ allow: ['Read'] }).permissions).toEqual({ ask: ['Bash'] });
    expect(settings({ allow: [] }).permissions).toEqual({ ask: ['Bash'] });
    expect(settings().permissions).toEqual({ ask: ['Bash'] });
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
  describe('Claude Code 2.1.312 (captured frames, paths and ids redacted)', () => {
    const workspace = resolve('workspace');
    // The system/init of a Turn in acceptEdits, trimmed to the fields SpecFlow reads.
    const init = {
      type: 'system',
      subtype: 'init',
      cwd: workspace,
      session_id: '00000000-0000-4000-8000-000000000001',
      tools: ['AskUserQuestion', 'Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'],
      mcp_servers: [],
      model: 'claude-haiku-4-5',
      permissionMode: 'acceptEdits',
      slash_commands: [],
      apiKeySource: 'none',
      claude_code_version: '2.1.312',
      output_style: 'default',
      agents: ['claude', 'Explore', 'general-purpose', 'Plan', 'web-fetch'],
      skills: [],
      plugins: [
        { name: 'cc-plugin-agents-md', path: 'builtin', source: 'cc-plugin-agents-md@builtin' },
        { name: 'cc-plugin-telemetry', path: 'builtin', source: 'cc-plugin-telemetry@builtin' },
        {
          name: 'cc-plugin-plugin-authoring',
          path: 'builtin',
          source: 'cc-plugin-plugin-authoring@builtin',
        },
      ],
      original_cwd: workspace,
      additional_directories: [workspace],
    };
    const acceptEdits = {
      providerId: 'claude',
      mode: 'workspace-write',
      providerModeId: 'acceptEdits',
    } as const;
    const auto = { ...acceptEdits, providerModeId: 'auto' } as const;

    it('accepts its system/init as the restricted profile', () => {
      expect(() => verifyClaudeInit(init, workspace, '2.1.312', acceptEdits)).not.toThrow();
      expect(() =>
        verifyClaudeInit(
          { ...init, permissionMode: 'plan', tools: ['AskUserQuestion', 'Glob', 'Grep', 'Read'] },
          workspace,
          '2.1.312',
        ),
      ).not.toThrow();
    });

    it('runs a writable Turn without a native mode (agent step execution) in acceptEdits', () => {
      expect(claudeMode({ providerId: 'claude', mode: 'workspace-write' }).modeId).toBe(
        'acceptEdits',
      );
      expect(() =>
        verifyClaudeInit(init, workspace, '2.1.312', {
          providerId: 'claude',
          mode: 'workspace-write',
        }),
      ).not.toThrow();
    });

    it('names the field and version a refused init fails on', () => {
      const refused =
        (changed: Record<string, unknown>, version = '2.1.312') =>
        () =>
          verifyClaudeInit({ ...init, ...changed }, workspace, version, acceptEdits);
      expect(refused({ permissionMode: 'default' })).toThrow(
        'Claude 2.1.312 started in permission mode default instead of acceptEdits.',
      );
      expect(refused({}, '2.1.311')).toThrow(
        'Claude reported version 2.1.312 at init but 2.1.311 at initialize.',
      );
      expect(refused({ cwd: resolve('elsewhere') })).toThrow('another working directory');
      expect(refused({ tools: [...init.tools, 'WebFetch'] })).toThrow('not allowed WebFetch');
      expect(refused({ tools: ['Read'] })).toThrow('missing Glob, Grep, AskUserQuestion');
      expect(refused({ mcp_servers: [{}] })).toThrow('MCP servers');
      expect(refused({ plugins: [{ name: 'x', path: 'builtin', source: 'x@builtin' }] })).toThrow(
        'the plugin x',
      );
      expect(refused({ type: 'assistant', subtype: undefined })).toThrow(
        'sent assistant output before its system/init frame',
      );
    });

    it('refuses the silent fallback from auto to default its system/status reports', () => {
      // Sent before system/init when the model has no auto mode (claude-haiku-4-5-20251001).
      const status = {
        type: 'system',
        subtype: 'status',
        status: null,
        permissionMode: 'default',
        session_id: '00000000-0000-4000-8000-000000000001',
      };
      expect(() => verifyClaudeStatus(status, auto, '2.1.312')).toThrow(
        'Claude 2.1.312 switched to permission mode default instead of auto.',
      );
      expect(() =>
        verifyClaudeStatus({ ...status, permissionMode: 'auto' }, auto, '2.1.312'),
      ).not.toThrow();
      expect(() =>
        verifyClaudeStatus({ ...status, permissionMode: undefined }, auto),
      ).not.toThrow();
    });

    it('offers in auto mode only the models Claude marks supportsAutoMode', () => {
      const payload = {
        claude_code_version: '2.1.312',
        models: [
          { value: 'haiku', displayName: 'Haiku', supportsAutoMode: true },
          { value: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5' },
        ],
      };
      expect(claudeModels(payload).map((model) => model.modelId)).toEqual([
        'haiku',
        'claude-haiku-4-5-20251001',
      ]);
      expect(claudeModels(payload, 'acceptEdits')).toHaveLength(2);
      expect(claudeModels(payload, 'auto').map((model) => model.modelId)).toEqual(['haiku']);
    });
  });
});
