// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { regionHeading } from './regionHeading';

afterEach(() => {
  document.body.replaceChildren();
});

describe('regionHeading', () => {
  it('prefers the heading of the active Secondary surface over an earlier one', () => {
    document.body.innerHTML = `
      <h2 id="early" data-workspace-header-title="true">Earlier</h2>
      <div data-workspace-surface="secondary" data-workspace-active="false">
        <h2 id="inactive" data-workspace-header-title="true">Inactive</h2>
      </div>
      <div data-workspace-surface="secondary" data-workspace-active="true">
        <h2 id="active" data-workspace-header-title="true">Active</h2>
      </div>`;
    expect(regionHeading()?.id).toBe('active');
  });

  it('falls back to any region heading and to null', () => {
    document.body.innerHTML = '<h2 id="only" data-workspace-header-title="true">Only</h2>';
    expect(regionHeading()?.id).toBe('only');
    document.body.innerHTML = '<h2>Plain</h2>';
    expect(regionHeading()).toBeNull();
  });
});
