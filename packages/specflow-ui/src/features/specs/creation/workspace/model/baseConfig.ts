import { designatedBaseRef, localBranchRef } from '@nevo/specflow-contracts/specs';
import type { DefaultBaseConfig } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../../i18n/message';
import type { CreateOptionsView } from './createOptionsView';
import type { WorkspaceChoice } from './workspaceChoice';

/** The listed branch designated by the configured default, if it has one. */
export function configuredBaseValue(options: CreateOptionsView): string {
  const branch = options.workspaces.find(
    (w) => w.workspaceId === options.primaryWorkspaceId,
  )?.branch;
  const ref =
    options.defaultBaseRef === 'HEAD'
      ? branch && localBranchRef(branch)
      : designatedBaseRef(options.defaultBaseRef);

  return ref && options.baseRefs.some((item) => item.ref === ref) ? ref : '';
}

/** A usable configured source wins; otherwise prefer the integration branch, then a local branch. */
export function preferredBaseRef(options: CreateOptionsView): string {
  if (options.defaultBaseConfig?.status !== 'unusable') {
    return options.defaultBaseRef;
  }

  const usable = options.baseRefs.filter((item) => item.projectConfig.status === 'usable');

  return (
    usable.find((item) => item.ref === localBranchRef(options.integrationTargetBranch ?? ''))
      ?.ref ??
    usable[0]?.ref ??
    options.defaultBaseRef
  );
}

/** A valid configured tag or commit remains usable even when no listed branch is. */
export function noUsableBaseConfig(options: CreateOptionsView): boolean {
  return (
    options.defaultBaseConfig?.status === 'unusable' &&
    !options.baseRefs.some((item) => item.projectConfig.status === 'usable')
  );
}

export function effectiveBaseRef(choice: WorkspaceChoice, options: CreateOptionsView): string {
  return choice.base.on ? choice.base.ref : preferredBaseRef(options);
}

/** Omission follows the configured policy, so an automatically preferred alternative is explicit. */
export function baseRefOverride(
  choice: WorkspaceChoice,
  options: CreateOptionsView,
): string | undefined {
  const ref = effectiveBaseRef(choice, options);

  return ref && ref !== options.defaultBaseRef && ref !== configuredBaseValue(options)
    ? ref
    : undefined;
}

export function baseConfigMessage(config: DefaultBaseConfig | undefined): Message | undefined {
  if (config?.status !== 'unusable') {
    return undefined;
  }

  return message(`create.workspace.baseConfig.${config.reason}`);
}

export function selectedBaseConfig(
  choice: WorkspaceChoice,
  options: CreateOptionsView,
): DefaultBaseConfig | undefined {
  const ref = effectiveBaseRef(choice, options);
  if (ref === options.defaultBaseRef || ref === configuredBaseValue(options)) {
    return options.defaultBaseConfig;
  }

  return options.baseRefs.find((item) => item.ref === ref)?.projectConfig;
}
