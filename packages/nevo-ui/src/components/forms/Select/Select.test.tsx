import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field } from '../Field';
import { floatingItemVariants } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import {
  Select,
  SelectTrigger,
  SelectValue,
  selectItemClassName,
  selectTriggerVariants,
} from './Select';

describe('Select', () => {
  it('renders a named native button trigger with combobox semantics', () => {
    const markup = renderToStaticMarkup(
      <Select defaultValue="active">
        <SelectTrigger aria-label="Status">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Status"');
  });

  it('keeps validation and disabled states explicit in the recipe', () => {
    expect(selectTriggerVariants()).toContain('overflow-hidden');
    expect(selectTriggerVariants({ state: 'invalid' })).toContain('border-border-error');
    expect(selectTriggerVariants({ state: 'disabled' })).toContain('opacity-60');
  });

  it('inherits disabled and invalid semantics from Field', () => {
    const markup = renderToStaticMarkup(
      <Field disabled invalid>
        <Field.Label>Status</Field.Label>
        <Select>
          <SelectTrigger>
            <SelectValue>Unavailable</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>,
    );
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('data-design-slot="control"');
  });

  it('keeps plain items on the shared floating item recipe', () => {
    expect(selectItemClassName({ keepsReasonReadable: false, unavailable: false })).toBe(
      cn('pr-8', floatingItemVariants()),
    );
  });

  it('keeps the reason readable on disabled items and mutes unavailable ones', () => {
    const readable = selectItemClassName({ keepsReasonReadable: true, unavailable: false });
    expect(readable).not.toContain('data-[disabled]:opacity-50');
    const unavailable = selectItemClassName({ keepsReasonReadable: true, unavailable: true });
    expect(unavailable).toContain('cursor-not-allowed');
  });
});
