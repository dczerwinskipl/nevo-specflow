import { renderTemplate, type TemplateValues } from '../archetypes/template-renderer';

/** The placeholders whose creation value the Specification does not keep (its goal). */
const GOAL_PLACEHOLDER = /\{\{(?:goal|goalOrPrompt)\}\}/u;

/** Line endings and trailing spaces never make a document "written". */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * The text a document of `template` holds while nobody has written it: the template rendered with
 * the Specification's values, as literal parts. The goal placeholders split the parts: the goal is
 * creation input the Specification does not keep, so any text may stand in their place.
 */
export function templateShape(
  template: string,
  values: Omit<TemplateValues, 'goal' | 'goalOrPrompt'>,
) {
  return template
    .split(GOAL_PLACEHOLDER)
    .map((part) => normalize(renderTemplate(part, { ...values, goal: '', goalOrPrompt: '' })));
}

/**
 * Whether `text` is still only its template (`templateShape`): the literal parts in order, with
 * nothing else around them, ignoring line endings, trailing spaces and the blank lines around a goal.
 */
export function matchesTemplateShape(text: string, shape: readonly string[]): boolean {
  const document = normalize(text);
  if (shape.length === 1) {
    return document === shape[0];
  }

  const first = shape[0]!;
  const last = shape.at(-1)!;
  if (!document.startsWith(first) || !document.endsWith(last)) {
    return false;
  }

  let from = first.length;
  const end = document.length - last.length;
  if (end < from) {
    return false;
  }

  for (const part of shape.slice(1, -1)) {
    const found = document.indexOf(part, from);
    if (found < 0 || found + part.length > end) {
      return false;
    }

    from = found + part.length;
  }

  return true;
}
