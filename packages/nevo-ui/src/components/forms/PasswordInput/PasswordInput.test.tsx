import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field } from '../Field';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('composes the shared text control with a localized visibility action', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="password">
        <Field.Label>Password</Field.Label>
        <PasswordInput labels={{ hide: 'Hide password', show: 'Show password' }} />
      </Field>,
    );
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).toContain('aria-labelledby="password-label"');
  });
});
