import type {
  ContentRef,
  Interaction,
  ToolActionSummary,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';
import type { StoreDatabase } from './database';
import type { createContentStorage } from './content';
import { decode } from './encoding';
import { claudeToolOperations } from '../providers/claude/protocol';
import {
  claudeToolError,
  claudeToolFailureReason,
  claudeToolSubject,
  firstLine,
  workspacePath,
} from '../providers/claude/subjects';
import { nativeToolOperation } from '../providers/tool-operations';

/** Inputs larger than this are not parsed for a subject (a tool's input is far smaller). */
const MAX_INPUT_BYTES = 64 * 1024;
/** The kind-only titles Claude Work had before it carried its own words. */
const genericTitles = new Set(['Claude commentary', 'Claude reasoning']);

/**
 * Claude Work recorded before Work carried a subject (2026-11-24): the read model names it from
 * what was stored — the first ToolAction's recorded input, the permission's summary, the
 * narration's own text — so old Turns read like new ones. Nothing is written back; Work that
 * already has its own subject, or Work of another provider, is returned as it is.
 */
export function createLegacyWork(
  { get, all }: Pick<StoreDatabase, 'get' | 'all'>,
  content: Pick<ReturnType<typeof createContentStorage>, 'preview'>,
) {
  function text(ref: ContentRef | undefined): string | undefined {
    if (!ref || ref.byteLength > MAX_INPUT_BYTES) {
      return undefined;
    }

    const bytes = Buffer.concat(
      all('SELECT data FROM chunks WHERE content=? ORDER BY offset', ref.contentId).map((row) =>
        Buffer.from(row.data as Uint8Array),
      ),
    );

    return bytes.subarray(0, ref.byteLength).toString('utf8');
  }

  function input(ref: ContentRef | undefined): Record<string, unknown> {
    try {
      const value: unknown = JSON.parse(text(ref) ?? '');

      return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  function workspaceOf(sessionId: string): string | undefined {
    const row = get('SELECT workspace FROM provider_contexts WHERE session=?', sessionId);

    return row ? String(row.workspace) : undefined;
  }

  function isClaude(sessionId: string): boolean {
    const row = get('SELECT data FROM sessions WHERE id=?', sessionId);

    return (
      !!row &&
      decode<{ snapshot: { session: { providerId: string } } }>(row).snapshot.session.providerId ===
        'claude'
    );
  }

  function action(item: ToolActionSummary, workspace?: string) {
    if (item.subject || !item.input) {
      return item;
    }

    const subject = claudeToolSubject(item.title.text, input(item.input), workspace);

    return subject ? { ...item, subject } : item;
  }

  function work(sessionId: string, item: WorkSummary, workspace?: string): WorkSummary {
    if (
      (item.kind === 'commentary' || item.kind === 'reasoning') &&
      item.content &&
      genericTitles.has(item.title.text)
    ) {
      return { ...item, title: content.preview(item.content) };
    }

    if (item.kind === 'tool' && !item.subject) {
      const actions = all(
        'SELECT data FROM actions WHERE work=? ORDER BY ordinal LIMIT 64',
        item.workId,
      ).map((row) => decode<ToolActionSummary>(row));
      const first = actions[0];
      if (!first) {
        return item;
      }

      const named = action(first, workspace);
      const failed = actions.find((entry) => entry.state === 'failed');
      const output = failed ? text(failed.output) : undefined;
      const failedSubject = failed ? action(failed, workspace).subject : undefined;

      return {
        ...item,
        title: first.title,
        operation:
          item.operation ??
          first.operation ??
          nativeToolOperation(claudeToolOperations, first.title.text),
        ...(named.subject ? { subject: named.subject } : {}),
        ...(failed && !item.failure
          ? {
              failure: {
                ...(failedSubject ? { subject: failedSubject } : {}),
                message: failed.error?.message ?? claudeToolError(output ?? '', workspace),
                ...(claudeToolFailureReason(output ?? '')
                  ? { reason: claudeToolFailureReason(output ?? '')! }
                  : {}),
              },
            }
          : {}),
      };
    }

    if (item.kind === 'interaction' && !item.subject) {
      const row = get(
        "SELECT data FROM interactions WHERE session=? AND json_extract(data,'$.workId')=?",
        sessionId,
        item.workId,
      );
      const interaction = row ? decode<Interaction>(row) : undefined;
      if (interaction?.kind !== 'permission') {
        return item;
      }

      const [head = '', ...rest] = interaction.actionSummary.split('\n');
      const file = /^(Write|Edit) file: (.+)$/.exec(head);
      const named: WorkSummary | undefined =
        head === 'Run command:'
          ? {
              ...item,
              title: { text: 'Bash', complete: true },
              operation: 'command',
              ...(firstLine(rest.join('\n')) ? { subject: firstLine(rest.join('\n'))! } : {}),
            }
          : file
            ? {
                ...item,
                title: { text: file[1]!, complete: true },
                operation: file[1] === 'Write' ? 'write' : 'edit',
                subject: workspacePath(file[2]!, workspace),
              }
            : undefined;

      return named ? { ...named, ...decisionOf(sessionId, named, workspace) } : item;
    }

    return item;
  }

  /**
   * The decision of an answered permission recorded before decisions were kept: the decision itself
   * was never stored, but its tool call was. Allowed when the same call (tool and subject) in the
   * Turn ran to completion, denied when it failed as refused; otherwise unknown (the client says
   * only that it was answered).
   */
  function decisionOf(
    sessionId: string,
    item: WorkSummary,
    workspace: string | undefined,
  ): Pick<WorkSummary, 'decision'> {
    if (item.decision || item.state !== 'completed') {
      return {};
    }

    const turn = get('SELECT turn FROM work WHERE id=?', item.workId)?.turn;
    const calls = all(
      'SELECT data FROM actions WHERE session=? AND turn=? LIMIT 500',
      sessionId,
      String(turn),
    )
      .map((row) => decode<ToolActionSummary>(row))
      .filter(
        (entry) =>
          entry.title.text === item.title.text &&
          (entry.subject ?? action(entry, workspace).subject) === item.subject,
      );
    if (calls.some((entry) => entry.state === 'completed')) {
      return { decision: 'allowed' };
    }

    const refused = calls.find(
      (entry) =>
        entry.state === 'failed' && /denied|rejected|not allowed/i.test(text(entry.output) ?? ''),
    );

    return refused ? { decision: 'denied' } : {};
  }

  return {
    /** A Work page's items, named from what was stored when they predate their subject. */
    work(sessionId: string, items: WorkSummary[]): WorkSummary[] {
      if (!isClaude(sessionId)) {
        return items;
      }

      const workspace = workspaceOf(sessionId);

      return items.map((item) => work(sessionId, item, workspace));
    },
    /** A ToolAction page's items, likewise. */
    actions(sessionId: string, items: ToolActionSummary[]): ToolActionSummary[] {
      if (!isClaude(sessionId)) {
        return items;
      }

      const workspace = workspaceOf(sessionId);

      return items.map((item) => action(item, workspace));
    },
  };
}
