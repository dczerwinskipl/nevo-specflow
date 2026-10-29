/**
 * Template rendering (architecture "Template rendering (exact)"). Only the placeholders below are
 * substituted; any other `{{...}}` text is left as is. Substitution is one left-to-right pass and
 * substituted values are never rescanned.
 */

/** Fixed goal text used when the creation goal is empty. */
export const GOAL_PROMPT_FALLBACK = 'Describe the intended outcome of this specification.';

export const TEMPLATE_PLACEHOLDERS = [
  'specificationTitle',
  'specificationTitleJson',
  'slug',
  'goal',
  'goalOrPrompt',
  'created',
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];
export type TemplateValues = Readonly<Record<TemplatePlaceholder, string>>;

export interface TemplateContextInput {
  readonly title: string;
  readonly slug: string;
  readonly goal?: string | undefined;
  /** Creation date `YYYY-MM-DD`. */
  readonly created: string;
}

/** The placeholder values for a Specification. */
export function templateValues(input: TemplateContextInput): TemplateValues {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const goal = input.goal?.trim() ?? '';

  return {
    specificationTitle: title,
    specificationTitleJson: JSON.stringify(title),
    slug: input.slug,
    goal,
    goalOrPrompt: goal.length > 0 ? goal : GOAL_PROMPT_FALLBACK,
    created: input.created,
  };
}

const PLACEHOLDER_PATTERN = new RegExp(`\\{\\{(${TEMPLATE_PLACEHOLDERS.join('|')})\\}\\}`, 'gu');

export function renderTemplate(content: string, values: TemplateValues): string {
  return content.replace(PLACEHOLDER_PATTERN, (_match, name: TemplatePlaceholder) => values[name]);
}
