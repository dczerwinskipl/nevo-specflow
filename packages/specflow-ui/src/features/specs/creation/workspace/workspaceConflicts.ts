/**
 * What the server refused about a typed field, remembered so the field can say so until it is
 * edited. The values are what was sent: a different edit makes the remembered refusal irrelevant.
 */
export interface WorkspaceConflicts {
  /** `exists`: the branch name is taken; `invalid`: Git does not accept it. */
  branch?: { readonly value: string; readonly reason: 'exists' | 'invalid' };
  slug?: { readonly value: string };
}
