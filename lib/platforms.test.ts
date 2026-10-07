import { describe, expect, it } from 'vitest';
import { lengthState } from './platforms';

describe('lengthState', () => {
  it('warns in the last tenth before the limit and flags anything past it', () => {
    expect(lengthState(100, 125)).toBe('ok');
    expect(lengthState(112, 125)).toBe('ok');
    expect(lengthState(113, 125)).toBe('near');
    expect(lengthState(125, 125)).toBe('near');
    expect(lengthState(126, 125)).toBe('over');
  });
});
