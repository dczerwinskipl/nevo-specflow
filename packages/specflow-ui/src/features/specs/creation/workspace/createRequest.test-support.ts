import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { buildCreateSlug, buildCreateTarget, type CreateTargetFields } from './createRequest';
import type { WorkspaceChoice } from './workspaceChoice';

/** The whole request a form with this choice would hand over (tests compose it from the two builders). */
export function buildCreateRequest(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
  operationId: string,
): CreateTargetFields & { operationId: string } {
  const target = buildCreateTarget(choice, options, title);
  const slug = buildCreateSlug(choice, options, title);
  return {
    title: title.trim(),
    operationId,
    ...(slug ? { slug } : {}),
    ...(target ? { target } : {}),
  };
}
