import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextInput } from '../TextInput';
import { Field } from './Field';

describe('Field', () => {
  it('associates labels and wrapped supporting content with the control', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="email" invalid>
        <Field.Label>Email</Field.Label>
        <TextInput />
        <div>
          <Field.Description>Used for notifications.</Field.Description>
        </div>
        <>
          <Field.Error>Enter a valid email.</Field.Error>
        </>
      </Field>,
    );
    expect(markup).toContain('for="email"');
    expect(markup).toContain('id="email"');
    expect(markup).toContain('id="email-description"');
    expect(markup).toContain('id="email-error"');
    expect(markup).toContain('aria-describedby="email-description email-error"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it('does not treat supporting content from a nested Field as its own', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="outer">
        <TextInput />
        <Field controlId="inner">
          <TextInput />
          <Field.Description>Inner only</Field.Description>
        </Field>
      </Field>,
    );
    expect(markup).not.toContain('id="outer-description"');
  });

  it('owns the disabled label appearance through React context', () => {
    const markup = renderToStaticMarkup(
      <Field disabled>
        <Field.Label>Company</Field.Label>
        <TextInput />
      </Field>,
    );
    expect(markup).toContain('field-label font-sans text-label-sm text-content-muted');
  });

  it('keeps owned accessibility ids consistent when child parts attempt overrides', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="owned" invalid>
        <Field.Label id="custom-label" htmlFor="custom-control">
          Name
        </Field.Label>
        <TextInput id="custom-control" aria-describedby="external-help" />
        <Field.Description id="custom-description">Helpful text</Field.Description>
        <Field.Error id="custom-error">Required</Field.Error>
      </Field>,
    );

    expect(markup).toContain('for="owned"');
    expect(markup).toContain('id="owned"');
    expect(markup).toContain('id="owned-label"');
    expect(markup).toContain('id="owned-description"');
    expect(markup).toContain('id="owned-error"');
    expect(markup).toContain('aria-describedby="external-help owned-description owned-error"');
    expect(markup).not.toContain('custom-label');
    expect(markup).not.toContain('custom-control');
    expect(markup).not.toContain('custom-description');
    expect(markup).not.toContain('custom-error');
  });

  it('keeps custom ids available for standalone field parts', () => {
    const markup = renderToStaticMarkup(
      <>
        <Field.Label id="standalone-label" htmlFor="standalone-control">
          Name
        </Field.Label>
        <Field.Description id="standalone-description">Helpful text</Field.Description>
      </>,
    );

    expect(markup).toContain('for="standalone-control"');
    expect(markup).toContain('id="standalone-label"');
    expect(markup).toContain('id="standalone-description"');
  });
});
