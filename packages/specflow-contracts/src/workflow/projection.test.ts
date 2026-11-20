import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { HeldTaskBlocksSchema } from './projection';

describe('HeldTaskBlocksSchema', () => {
  it('names at least what the held Task holds up', () => {
    expect(Value.Check(HeldTaskBlocksSchema, { taskIds: ['web'] })).toBe(true);
    expect(Value.Check(HeldTaskBlocksSchema, { finish: 'acceptance' })).toBe(true);
    expect(Value.Check(HeldTaskBlocksSchema, { taskIds: ['web'], finish: 'acceptance' })).toBe(
      true,
    );
    expect(Value.Check(HeldTaskBlocksSchema, {})).toBe(false);
    expect(Value.Check(HeldTaskBlocksSchema, { taskIds: [] })).toBe(false);
  });
});
