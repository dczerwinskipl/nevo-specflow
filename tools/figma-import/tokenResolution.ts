import type { ColorTokenIR } from '@nevo/figma-core/ir';

/** Explicit semantic identity always wins over visually equal token values. */
export function resolveSemanticTokenId(
  explicitStableId: string | undefined,
  _value: string | undefined,
  tokens: readonly ColorTokenIR[],
) {
  if (explicitStableId && tokens.some((token) => token.stableId === explicitStableId))
    return explicitStableId;
  return undefined;
}



