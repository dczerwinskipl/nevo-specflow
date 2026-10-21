import { createSpecFlowI18n } from './i18n';
import { translateMessage, type Message } from './message';

const polish = createSpecFlowI18n('pl');

/** Renders a policy {@link Message} in Polish for unit tests that assert the user-facing text. */
export function polishText(value: Message | string): string;
export function polishText(value: Message | string | undefined): string | undefined;
export function polishText(value: Message | string | undefined): string | undefined {
  return value === undefined ? undefined : translateMessage(polish.t, value);
}
