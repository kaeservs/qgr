import { describe, expect, it } from 'vitest';
import { checkPhoto, ownPhotoPath, parseEmail, parseName, parsePasswordChange } from './profile-input';

describe('the profile’s rules', () => {
  it('tidies a name and refuses an empty or long one', () => {
    expect(parseName('  Kaeser\n  Valencerina ')).toEqual({ ok: true, value: 'Kaeser Valencerina' });
    expect(parseName('   ').ok).toBe(false);
    expect(parseName('x'.repeat(81)).ok).toBe(false);
    expect(parseName(42).ok).toBe(false);
  });

  it('takes an email address, lower-cased', () => {
    expect(parseEmail(' Name@QGR.example ')).toEqual({ ok: true, value: 'name@qgr.example' });
    expect(parseEmail('name@qgr').ok).toBe(false);
    expect(parseEmail('not an email').ok).toBe(false);
  });

  it('wants the current password, a long enough new one typed twice, and a change', () => {
    expect(parsePasswordChange({ current: 'old-one', next: 'a-new-one', again: 'a-new-one' })).toEqual({ ok: true, value: { current: 'old-one', next: 'a-new-one' } });
    expect(parsePasswordChange({ next: 'a-new-one', again: 'a-new-one' })).toMatchObject({ ok: false, error: 'Enter your current password.' });
    expect(parsePasswordChange({ current: 'old-one', next: 'short', again: 'short' }).ok).toBe(false);
    expect(parsePasswordChange({ current: 'old-one', next: 'a-new-one', again: 'a-new-two' })).toMatchObject({ ok: false, error: 'The two new passwords don’t match.' });
    expect(parsePasswordChange({ current: 'same-one!', next: 'same-one!', again: 'same-one!' }).ok).toBe(false);
  });

  it('knows a JPEG by its bytes', () => {
    expect(checkPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toBeNull();
    expect(checkPhoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toMatch(/isn’t a photo/);
    expect(checkPhoto(new Uint8Array(0))).toBe('Pick a photo.');
    expect(checkPhoto(new Uint8Array(600 * 1024).fill(0xff))).toBe('That photo is too large.');
  });

  it('treats only a photo in the person’s own folder as theirs', () => {
    const id = '7d341581-04d5-403c-981b-8fe952c08e28';
    expect(ownPhotoPath(id, `photos/${id}/0b6f8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg`)).toBe(true);
    expect(ownPhotoPath(id, `photos/someone-else/0b6f8a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg`)).toBe(false);
    expect(ownPhotoPath(id, `photos/${id}/../x.jpg`)).toBe(false);
    expect(ownPhotoPath(id, null)).toBe(false);
  });
});
