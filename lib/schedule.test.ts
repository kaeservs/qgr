import { describe, expect, it } from 'vitest';
import { formatInZone, localTime, nextScanAt, scanLabel, wallTime, zonedToUtc, zoneLabel } from './schedule';

describe('times in the team’s zone', () => {
  it('reads a wall time as the instant it names, across daylight saving', () => {
    expect(zonedToUtc('2026-10-12 09:00', 'America/New_York')).toBe('2026-10-12T13:00:00.000Z');
    expect(zonedToUtc('2026-11-02 09:00', 'America/New_York')).toBe('2026-11-02T14:00:00.000Z');
    expect(zonedToUtc('2026-10-14 09:00', 'Asia/Kolkata')).toBe('2026-10-14T03:30:00.000Z');
    expect(zonedToUtc('2026-10-14 09:00', 'UTC')).toBe('2026-10-14T09:00:00.000Z');
  });

  it('shows an instant as the zone’s wall time', () => {
    expect(wallTime('2026-10-12T13:00:00Z', 'America/New_York')).toEqual({ date: '2026-10-12', time: '09:00' });
    expect(formatInZone('2026-10-12T13:00:00Z', 'America/New_York')).toBe('Mon 12 Oct, 09:00');
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('UTC')).toBe('UTC');
  });

  it('accepts only a whole date and time', () => {
    expect(localTime('2026-10-12', '09:30')).toBe('2026-10-12 09:30');
    expect(localTime('2026-10-12', '24:00')).toBeNull();
    expect(localTime('12/10/2026', '09:30')).toBeNull();
  });
});

describe('the scan schedule', () => {
  const weekly = { scanEvery: 'week' as const, scanDay: 1, scanHour: 9, timeZone: 'America/New_York' };

  it('names itself', () => {
    expect(scanLabel(weekly)).toBe('Scans every Monday, 09:00');
    expect(scanLabel({ ...weekly, scanEvery: 'day' })).toBe('Scans every day, 09:00');
    expect(scanLabel({ ...weekly, scanEvery: 'off' })).toBeNull();
  });

  it('falls due next at the wall time, as the database works it out', () => {
    expect(nextScanAt(weekly, '2026-10-07T09:30:00Z')).toBe('2026-10-12T13:00:00.000Z');
    expect(nextScanAt(weekly, '2026-10-12T12:59:00Z')).toBe('2026-10-12T13:00:00.000Z');
    expect(nextScanAt(weekly, '2026-10-12T13:00:00Z')).toBe('2026-10-19T13:00:00.000Z');
    expect(nextScanAt({ ...weekly, scanEvery: 'day' }, '2026-10-07T14:00:00Z')).toBe('2026-10-08T13:00:00.000Z');
    expect(nextScanAt({ ...weekly, scanEvery: 'off' }, '2026-10-07T14:00:00Z')).toBeNull();
  });
});
