import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field } from '../Field';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('bridges Field labeling to the composite number field', () => {
    const markup = renderToStaticMarkup(
      <Field controlId="quantity">
        <Field.Label>Quantity</Field.Label>
        <NumberInput defaultValue={2} />
      </Field>,
    );
    expect(markup).toContain('aria-labelledby="quantity-label"');
    expect(markup).toContain('inputMode="numeric"');
  });

  it('can hide steppers without changing numeric semantics', () => {
    const markup = renderToStaticMarkup(
      <NumberInput aria-label="Ratio" defaultValue={0.5} showSteppers={false} />,
    );
    expect(markup).not.toContain('slot="increment"');
    expect(markup).toContain('inputMode="numeric"');
  });

  it('gives embedded stepper actions a visible local focus treatment', () => {
    const markup = renderToStaticMarkup(<NumberInput aria-label="Quantity" defaultValue={2} />);
    expect(markup).toContain('focus-visible:bg-surface-selected');
    expect(markup).toContain('data-focus-ring="delegated"');
  });
});
