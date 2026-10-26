import { expect, it } from 'vitest';
import { claudeRegistryInspection, inspectClaudeRegistry } from './registry';

it('inspects both hives and both registry views without accepting a missing system executable root', async () => {
  expect(claudeRegistryInspection).toContain('RegistryHive]::LocalMachine');
  expect(claudeRegistryInspection).toContain('RegistryHive]::CurrentUser');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry64');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry32');
  expect(claudeRegistryInspection).toContain("'SOFTWARE\\Policies\\ClaudeCode'");
  expect(await inspectClaudeRegistry({ values: {}, sources: {} })).toBe(false);
});
