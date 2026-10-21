import { createHash } from 'node:crypto';

import { CreateOperationError } from './create-error';
import { isExplicitSpecificationSlug } from './model';

export type ClientOverride =
  { readonly kind: 'omitted' } | { readonly kind: 'explicit'; readonly value: string };

export type ClientCreateTarget =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | {
      readonly kind: 'new-worktree';
      readonly baseRef: ClientOverride;
      readonly branch: ClientOverride;
      /** Omission retains the project default and legacy intent fingerprint. */
      readonly integrationTargetWorkspaceId?: string;
    };

/**
 * Canonical client intent; generated dates and currently configured Git defaults
 * are deliberately absent. Transport adapters preserve omission vs explicitness.
 */
export interface CreateClientIntent {
  readonly title: string;
  readonly goal?: string;
  /** Omitted keeps the title-derived slug and the legacy intent fingerprint. */
  readonly slug?: string;
  readonly target: ClientCreateTarget;
}

export type CreateClientTargetInput =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | {
      readonly kind: 'new-worktree';
      readonly baseRef?: string;
      readonly branch?: string;
      readonly integrationTargetWorkspaceId?: string;
    };

export function normalizeCreateClientIntent(input: {
  readonly title: string;
  readonly goal?: string;
  readonly slug?: string;
  readonly target: CreateClientTargetInput;
}): CreateClientIntent {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const goal = input.goal?.trim();
  if (!title || title.length > 200) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid specification title.');
  }
  if (input.slug !== undefined && !isExplicitSpecificationSlug(input.slug)) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid specification slug.');
  }
  const target = normalizeClientTarget(input.target);
  return {
    title,
    ...(goal ? { goal } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    target,
  };
}

export function fingerprintCreateClientIntent(intent: CreateClientIntent): string {
  return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex');
}

function normalizeClientTarget(input: CreateClientTargetInput): ClientCreateTarget {
  switch (input.kind) {
    case 'existing':
      return { kind: 'existing', workspaceId: input.workspaceId };
    case 'new-worktree':
      return {
        kind: 'new-worktree',
        baseRef: normalizeOverride(input.baseRef),
        branch: normalizeOverride(input.branch),
        ...(input.integrationTargetWorkspaceId !== undefined
          ? { integrationTargetWorkspaceId: input.integrationTargetWorkspaceId }
          : {}),
      };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function normalizeOverride(value: string | undefined): ClientOverride {
  if (value === undefined) return { kind: 'omitted' };
  return { kind: 'explicit', value };
}
