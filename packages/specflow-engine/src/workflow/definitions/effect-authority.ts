import type { WorkflowEffect } from '@nevo/specflow-contracts/documents';
import type { WorkflowTransition } from './model';

/**
 * Who may grant what a transition's effect does. `owner` effects are decisions only the owner takes:
 * an agent's proposal that carries one is not applied by the agent but waits for the owner's
 * confirmation. Exhaustive over {@link WorkflowEffect}, so a new effect must classify itself.
 */
export type EffectAuthority = 'owner' | 'agent';

const EFFECT_AUTHORITY: Readonly<Record<WorkflowEffect, EffectAuthority>> = {
  'approve-draft-tasks': 'owner',
};

export function effectAuthorityOf(effect: WorkflowEffect): EffectAuthority {
  return EFFECT_AUTHORITY[effect];
}

/**
 * Whether an agent's finish with this transition needs the owner's confirmation: the definition
 * marks it `confirmation: owner`, or one of its effects is owner authority.
 */
export function requiresOwnerConfirmation(transition: WorkflowTransition): boolean {
  const { confirmation, effects } = transition.annotations;

  return (
    confirmation === 'owner' || effects.some((effect) => effectAuthorityOf(effect) !== 'agent')
  );
}
