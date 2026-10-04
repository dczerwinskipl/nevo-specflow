import { renderToStaticMarkup } from 'react-dom/server';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
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

  it('hosts the Field control slot on the PasswordInput component root during design capture', () => {
    const markup = renderToStaticMarkup(
      <DesignCaptureProvider>
        <Field controlId="password">
          <Field.Label>Password</Field.Label>
          <PasswordInput labels={{ hide: 'Hide password', show: 'Show password' }} />
        </Field>
      </DesignCaptureProvider>,
    );

    expect(markup).toMatch(
      /<div[^>]*data-design-slot="control"[^>]*data-design-component="PasswordInput"|<div[^>]*data-design-component="PasswordInput"[^>]*data-design-slot="control"/u,
    );
  });
});
