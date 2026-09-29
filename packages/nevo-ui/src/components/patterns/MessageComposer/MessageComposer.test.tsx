import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../../actions/Button';
import { MessageComposer, resolveMessageComposerKeyAction } from './MessageComposer';

describe('MessageComposer', () => {
  it('uses a native form and propagates disabled and read-only state', () => {
    const disabled = renderToStaticMarkup(
      <MessageComposer disabled onSubmit={() => undefined}>
        <MessageComposer.Editor aria-label="Reply" defaultValue="Draft" />
        <MessageComposer.Toolbar>
          <Button type="submit">Send</Button>
        </MessageComposer.Toolbar>
      </MessageComposer>,
    );
    const readOnly = renderToStaticMarkup(
      <MessageComposer onSubmit={() => undefined} readOnly>
        <MessageComposer.Editor aria-label="Note" defaultValue="Audit history" />
      </MessageComposer>,
    );

    expect(disabled.startsWith('<form')).toBe(true);
    expect(disabled).toContain('<fieldset');
    expect(disabled).toContain('class="contents"');
    expect(disabled).toContain('disabled=""');
    expect(disabled).toContain('border-border-subtle');
    expect(disabled).toContain('bg-surface-subtle');
    expect(disabled).toContain('opacity-60');
    expect(disabled).toContain('data-control-surface="embedded"');
    expect(disabled).toContain('text-area-embedded');
    expect(disabled).not.toContain('message-composer-editor');
    expect(disabled).toContain('rounded-none border-0 bg-transparent');
    expect(readOnly).toContain('readOnly=""');
  });

  it('does not intercept newlines or IME composition', () => {
    expect(
      resolveMessageComposerKeyAction({
        enterKeyBehavior: 'submit',
        isComposing: false,
        key: 'Enter',
        shiftKey: false,
      }),
    ).toBe('submit');

    expect(
      resolveMessageComposerKeyAction({
        enterKeyBehavior: 'submit',
        isComposing: false,
        key: 'Enter',
        shiftKey: true,
      }),
    ).toBe('newline');

    expect(
      resolveMessageComposerKeyAction({
        enterKeyBehavior: 'submit',
        isComposing: true,
        key: 'Enter',
        shiftKey: false,
      }),
    ).toBe('newline');

    expect(
      resolveMessageComposerKeyAction({
        enterKeyBehavior: 'newline',
        isComposing: false,
        key: 'Enter',
        shiftKey: false,
      }),
    ).toBe('newline');

    expect(
      resolveMessageComposerKeyAction({
        enterKeyBehavior: 'submit',
        isComposing: false,
        key: 'a',
        shiftKey: false,
      }),
    ).toBe('none');
  });
});

