import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareAntigravityPermission } from './permissions';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'specflow-hook-policy-'));
  directories.push(root);
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  await mkdir(workspace);
  await mkdir(outside);
  const context = {
    nativeSessionId: 'native-controlled',
    workspace,
    writable: true,
    commandsAllowed: true,
  };
  const hook = (name: string, args: object) => ({
    conversationId: context.nativeSessionId,
    workspacePaths: [workspace],
    stepIdx: 1,
    toolCall: { name, args },
  });

  return { root, workspace, outside, context, hook };
}

describe('native Antigravity hook policy', () => {
  it('admits the installed native read schema with metadata and content offset', async () => {
    const f = await fixture();
    const result = await prepareAntigravityPermission(
      f.hook('view_file', {
        AbsolutePath: join(f.workspace, 'file.txt'),
        ContentOffset: 0,
        StartLine: 1,
        EndLine: 10,
        toolSummary: 'Read the requested file',
        toolAction: 'read',
      }),
      f.context,
    );
    expect(result.decision).toEqual({ decision: 'allow' });
    await result.revalidate();
    await expect(
      prepareAntigravityPermission(
        f.hook('view_file', {
          AbsolutePath: join(f.outside, 'file.txt'),
          toolSummary: 'Read',
          toolAction: 'read',
        }),
        f.context,
      ),
    ).rejects.toThrow();
  });

  it('allows only the exact Runtime question MCP tool without duplicating canonical admission', async () => {
    const f = await fixture();
    const args = {
      Arguments: { question: 'Controlled question' },
      ServerName: 'specflow-interactions',
      ToolName: 'ask_user',
      toolAction: 'ask',
      toolSummary: 'Controlled question',
    };
    const result = await prepareAntigravityPermission(f.hook('call_mcp_tool', args), f.context);
    expect(result.decision).toEqual({ decision: 'allow' });
    expect(result.interaction).toBeUndefined();
    await result.revalidate();
    for (const changes of [
      { ServerName: 'external' },
      { ToolName: 'other' },
      { toolAction: undefined },
      { unknown: true },
      { Arguments: { question: '' } },
    ]) {
      const changed = { ...args, ...changes };
      if (changed.toolAction === undefined) {
        delete (changed as Record<string, unknown>).toolAction;
      }

      await expect(
        prepareAntigravityPermission(f.hook('call_mcp_tool', changed), f.context),
      ).rejects.toThrow();
    }

    for (const name of [
      'list_resources',
      'read_resource',
      'mcp__specflow-interactions__ask_user',
    ]) {
      await expect(prepareAntigravityPermission(f.hook(name, args), f.context)).rejects.toThrow();
    }
  });

  it('defers known in-root file operations to native Agent policy without creating a permission', async () => {
    const f = await fixture();
    const result = await prepareAntigravityPermission(
      f.hook('write_to_file', {
        TargetFile: join(f.workspace, 'new', 'file.txt'),
        Overwrite: true,
        CodeContent: 'controlled',
        Description: 'controlled',
        toolSummary: 'controlled',
        toolAction: 'write',
      }),
      f.context,
    );
    expect(result.decision).toEqual({ decision: 'allow' });
    expect(result.interaction).toBeUndefined();
  });

  it('requires a canonical single-operation interaction for an exact command and cwd', async () => {
    const f = await fixture();
    const args = {
      CommandLine: 'echo controlled',
      Cwd: f.workspace,
      WaitMsBeforeAsync: 5000,
      toolSummary: 'Controlled fixture',
      toolAction: 'execute',
    };
    const result = await prepareAntigravityPermission(f.hook('run_command', args), f.context);
    expect(result.interaction?.kind).toBe('permission');
    expect(JSON.parse(result.interaction!.actionSummary)).toEqual({ tool: 'run_command', args });
    await result.revalidate();
  });

  it('denies commands without the independently proven execution prerequisite', async () => {
    const f = await fixture();
    await expect(
      prepareAntigravityPermission(
        f.hook('run_command', {
          CommandLine: 'echo controlled',
          Cwd: f.workspace,
          WaitMsBeforeAsync: 5000,
          toolSummary: 'Controlled fixture',
          toolAction: 'execute',
        }),
        { ...f.context, commandsAllowed: undefined },
      ),
    ).rejects.toThrow();
  });

  it('denies writes that would introduce workspace hooks, MCP servers or executable plugins mid-invocation', async () => {
    const f = await fixture();
    for (const suffix of [
      'hooks.json',
      'mcp_config.json',
      'plugins/plugin.json',
      'sidecars/sidecar.json',
      'projects/project.json',
    ]) {
      await expect(
        prepareAntigravityPermission(
          f.hook('write_to_file', {
            TargetFile: join(f.workspace, '.agents', suffix),
            CodeContent: '{}',
          }),
          f.context,
        ),
      ).rejects.toThrow('active execution configuration');
    }
  });

  it.skipIf(process.platform !== 'win32')(
    'rejects NTFS aliases and alternate streams before native file mutation',
    async () => {
      const f = await fixture();
      for (const suffix of [
        '.agents./hooks.json',
        '.agents /hooks.json',
        '.agents/hooks.json::$DATA',
      ]) {
        await expect(
          prepareAntigravityPermission(
            f.hook('write_to_file', { TargetFile: join(f.workspace, suffix) }),
            f.context,
          ),
        ).rejects.toThrow();
      }
    },
  );

  it('rejects outside, symlink escape, uncorrelated, readonly and unknown execution', async () => {
    const f = await fixture();
    const link = join(f.workspace, 'link');
    await symlink(f.outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    for (const input of [
      f.hook('write_to_file', { TargetFile: join(f.outside, 'file') }),
      f.hook('write_to_file', { TargetFile: join(link, 'file') }),
      f.hook('manage_task', { Action: 'send_input', TaskId: 'unowned' }),
      f.hook('schedule', { Prompt: 'controlled' }),
      { ...f.hook('list_dir', { DirectoryPath: f.workspace }), conversationId: 'other' },
    ]) {
      await expect(prepareAntigravityPermission(input, f.context)).rejects.toThrow();
    }

    await expect(
      prepareAntigravityPermission(
        f.hook('write_to_file', { TargetFile: join(f.workspace, 'file') }),
        { ...f.context, writable: false },
      ),
    ).rejects.toThrow();
  });

  it('rejects dangling links instead of treating their external destination as an absent in-root file', async () => {
    const f = await fixture();
    const target = join(f.workspace, 'dangling-directory');
    await symlink(
      join(f.outside, 'absent-directory'),
      target,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(
      prepareAntigravityPermission(
        f.hook('write_to_file', { TargetFile: join(target, 'file.txt') }),
        f.context,
      ),
    ).rejects.toThrow('symbolic link');
  });

  it('rejects persistent, terminal reuse, unbounded and unknown command arguments', async () => {
    const f = await fixture();
    const args = {
      CommandLine: 'echo controlled',
      Cwd: f.workspace,
      WaitMsBeforeAsync: 5000,
      toolSummary: 'Controlled fixture',
      toolAction: 'execute',
    };
    for (const changed of [
      { RunPersistent: true },
      { RequestedTerminalID: 'old-terminal' },
      { BypassSandbox: true },
      { BypassSandbox: 'false' },
      { IsDaemon: true },
      { WaitMsBeforeAsync: 0 },
      { Background: true },
    ]) {
      await expect(
        prepareAntigravityPermission(f.hook('run_command', { ...args, ...changed }), f.context),
      ).rejects.toThrow();
    }
  });

  it('accepts explicit false flags in the installed native command schema', async () => {
    const f = await fixture();
    const result = await prepareAntigravityPermission(
      f.hook('run_command', {
        CommandLine: 'echo controlled',
        Cwd: f.workspace,
        WaitMsBeforeAsync: 5000,
        toolSummary: 'Controlled fixture',
        toolAction: 'execute',
        BypassSandbox: false,
        IsDaemon: false,
      }),
      f.context,
    );
    expect(result.interaction?.kind).toBe('permission');
  });
});
