import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a path inside the app, query included', () => {
    expect(safeNext('/runs/abc?tab=x')).toBe('/runs/abc?tab=x');
  });

  it('sends anything else home', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'evil.example', '', null, undefined, 42]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
