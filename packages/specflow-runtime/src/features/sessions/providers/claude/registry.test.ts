import { expect, it } from 'vitest';
import {
  claudeRegistryInspection,
  inspectClaudeRegistry,
  registryInspectionResult,
} from './registry';
it('requires positive policy absence and keeps execution failures distinct from policy presence', () => {
  expect(registryInspectionResult(null, 'absent')).toBe('absent');
  expect(registryInspectionResult(null, 'present')).toBe('present');
  expect(registryInspectionResult(new Error('Timed out'), 'absent')).toBe('unavailable');
  expect(registryInspectionResult(null, 'absent\nunexpected')).toBe('unavailable');
});

it('inspects both hives and both registry views without accepting a missing system executable root', async () => {
  expect(claudeRegistryInspection).toContain('RegistryHive]::LocalMachine');
  expect(claudeRegistryInspection).toContain('RegistryHive]::CurrentUser');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry64');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry32');
  expect(claudeRegistryInspection).toContain("'SOFTWARE\\Policies\\ClaudeCode'");
  expect(await inspectClaudeRegistry({ values: {}, sources: {} })).toBe(false);
});
