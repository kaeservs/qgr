import { describe, expect, it } from 'vitest';
import {
  adOf,
  campaignOf,
  countsOf,
  filterLeads,
  finalVerdict,
  fisher,
  groupLeads,
  parseCriteria,
  parseLeadVerdict,
  parsePostLink,
  parseZohoAddress,
  qualifiedShare,
  suggestionDirection,
  suggestionsOf,
  taggedLink,
  zohoLeadUrl,
} from './leads';
import { parseNewPost } from './post-input';
import type { Lead, LeadVerdict } from './types';

let n = 0;
const lead = (extra: Partial<Lead> = {}, verdict: LeadVerdict | null = 'qualified'): Lead => ({
  id: `l-${++n}`,
  name: `Lead ${n}`,
  createdAt: '2026-10-05T10:00:00Z',
  platform: 'facebook',
  campaign: {},
  answers: [{ field: 'Investment budget', value: '$800,000 to $1M' }],
  judging: verdict ? 'done' : 'waiting',
  ...(verdict ? { ai: { verdict, reasons: [], at: '2026-10-05T10:05:00Z', olderCriteria: false } } : {}),
  ...extra,
});
const fromVariant = (label: 'A' | 'B' | 'C', place: 'facebook' | 'linkedin' = 'facebook') => ({
  from: { runId: 'r-1041', runTitle: 'From H-1B to EB-5', adSetId: 'a-podcast', variantId: `v-pod-${label.toLowerCase()}`, label, angle: `Angle ${label}`, place },
});

describe('a lead’s verdict and counts', () => {
  it('counts a person’s verdict over Claude’s, and a lead neither has judged as waiting', () => {
    expect(finalVerdict(lead({}, 'unclear'))).toBe('unclear');
    expect(finalVerdict(lead({ person: { verdict: 'qualified', at: '2026-10-06T00:00:00Z' } }, 'not_qualified'))).toBe('qualified');
    expect(finalVerdict(lead({}, null))).toBe('waiting');
    const c = countsOf([lead(), lead({}, 'not_qualified'), lead({}, 'unclear'), lead({}, null)]);
    expect(c).toEqual({ leads: 4, qualified: 1, notQualified: 1, unclear: 1, waiting: 1 });
    // The share is of the leads judged.
    expect(qualifiedShare(c)).toBeCloseTo(1 / 3);
    expect(qualifiedShare(countsOf([lead({}, null)]))).toBeNull();
  });
});

describe('campaigns and ads', () => {
  it('ties a lead by what it carries: Meta’s campaign, then the QGR run, then its link’s tag, else nothing', () => {
    const meta = lead({ campaign: { id: '120210', name: 'EB-5 webinar · lead form', adId: '9001', adName: 'Family planning' } });
    expect(campaignOf(meta)).toEqual({ key: 'meta:120210', name: 'EB-5 webinar · lead form', kind: 'meta' });
    expect(adOf(meta)).toEqual({ key: 'ad:9001', name: 'Family planning' });
    const ours = lead(fromVariant('B', 'linkedin'));
    expect(campaignOf(ours)).toEqual({ key: 'run:r-1041', name: 'From H-1B to EB-5', kind: 'run', runId: 'r-1041' });
    expect(adOf(ours)).toEqual({ key: 'variant:v-pod-b:linkedin', name: 'Variant B on LinkedIn', variantId: 'v-pod-b', adSetId: 'a-podcast' });
    const tagged = lead({ campaign: { utm: { campaign: 'spring-webinar', content: 'banner' } } });
    expect(campaignOf(tagged)).toMatchObject({ key: 'tag:spring-webinar', kind: 'tags' });
    expect(adOf(tagged)).toEqual({ key: 'content:banner', name: 'banner' });
    expect(campaignOf(lead())).toMatchObject({ key: 'none', kind: 'none' });
    expect(adOf(lead())).toEqual({ key: 'none', name: 'Not tied to an ad' });
  });

  it('groups by campaign and ad, most leads first, the leads tied to nothing last', () => {
    const groups = groupLeads([
      lead(),
      lead(fromVariant('A')),
      lead(fromVariant('A'), 'not_qualified'),
      lead(fromVariant('B')),
      lead({ campaign: { name: 'Lead form', adName: 'Family' }, platform: 'meta' }),
      lead(),
      lead(),
    ]);
    expect(groups.map((g) => [g.name, g.counts.leads])).toEqual([
      ['From H-1B to EB-5', 3],
      ['Lead form', 1],
      ['Not tied to a campaign', 3],
    ]);
    expect(groups[0]!.ads.map((a) => [a.name, a.counts.leads, a.counts.qualified, a.angle])).toEqual([
      ['Variant A on Facebook', 2, 1, 'Angle A'],
      ['Variant B on Facebook', 1, 1, 'Angle B'],
    ]);
    expect(groups[1]!.platforms).toEqual(['meta']);
  });

  it('filters by period, platform, campaign and verdict', () => {
    const now = '2026-10-07T09:30:00Z';
    const old = lead({ createdAt: '2026-08-01T00:00:00Z', platform: 'linkedin' });
    const recent = lead(fromVariant('A'));
    const waiting = lead({ createdAt: '2026-10-07T08:00:00Z' }, null);
    const all = [old, recent, waiting];
    expect(filterLeads(all, { period: 30 }, now)).toEqual([recent, waiting]);
    expect(filterLeads(all, { period: 'all', platform: 'linkedin' }, now)).toEqual([old]);
    expect(filterLeads(all, { campaign: 'run:r-1041' }, now)).toEqual([recent]);
    expect(filterLeads(all, { verdict: 'waiting' }, now)).toEqual([waiting]);
  });
});

describe('suggestions', () => {
  it('computes Fisher’s exact test as the textbook does', () => {
    // The lady tasting tea: 3 of 4 against 1 of 4, two-sided.
    expect(fisher(3, 4, 1, 4)).toBeCloseTo(0.4857, 4);
    expect(fisher(9, 12, 3, 15)).toBeCloseTo(0.0067, 3);
    expect(fisher(2, 4, 2, 4)).toBeCloseTo(1, 6);
  });

  it('suggests only where an ad differs from the rest of its campaign by more than chance', () => {
    const many = (count: number, make: () => Lead) => Array.from({ length: count }, make);
    const leads = [
      ...many(9, () => lead(fromVariant('B'))),
      ...many(3, () => lead(fromVariant('B'), 'not_qualified')),
      ...many(3, () => lead(fromVariant('A'))),
      ...many(12, () => lead(fromVariant('A'), 'not_qualified')),
      // Too few judged to compare, and waiting leads count for nothing.
      ...many(2, () => lead(fromVariant('C'))),
      ...many(5, () => lead(fromVariant('C'), null)),
    ];
    const found = suggestionsOf(groupLeads(leads));
    expect(found.map((s) => s.kind)).toEqual(['rethink', 'more-like']);
    // Strongest first: the smaller chance it is luck.
    expect(found[0]!.facts.p).toBeLessThan(found[1]!.facts.p);
    const best = found.find((s) => s.kind === 'more-like');
    const worst = found.find((s) => s.kind === 'rethink');
    expect(best).toMatchObject({ kind: 'more-like', ad: 'Variant B on Facebook', variantId: 'v-pod-b', adSetId: 'a-podcast', angle: 'Angle B', facts: { qualified: 9, judged: 12, restQualified: 5, restJudged: 17 } });
    expect(best!.text).toBe('Make more like Variant B on Facebook: 9 of 12 of its leads qualified (75%), against 5 of 17 (29%) for the rest of From H-1B to EB-5.');
    expect(worst).toMatchObject({ kind: 'rethink', ad: 'Variant A on Facebook', facts: { qualified: 3, judged: 15 } });
    expect(suggestionDirection(best!)).toBe('9 of 12 leads from Variant B on Facebook were qualified, against 5 of 17 from the rest of From H-1B to EB-5. Write new ads for the same people on the same angle (Angle B): new words, not copies of these.');
    // An even split suggests nothing.
    expect(suggestionsOf(groupLeads([...many(6, () => lead(fromVariant('A'))), ...many(6, () => lead(fromVariant('B')))]))).toEqual([]);
  });
});

describe('Zoho, tagged links and the team’s words', () => {
  it('reads a Zoho CRM’s region and organisation from its address, and links a lead there', () => {
    const eu = parseZohoAddress('https://crm.zoho.eu/crm/org20123456/tab/Home/begin');
    expect(eu).toEqual({ ok: true, value: { region: 'eu', org: 'org20123456' } });
    expect(parseZohoAddress('crm.zohocloud.ca/crm/tab/Leads')).toEqual({ ok: true, value: { region: 'ca', org: null } });
    expect(parseZohoAddress('https://crm.zoho.com')).toEqual({ ok: true, value: { region: 'com', org: null } });
    expect(parseZohoAddress('https://zoho.example/crm')).toMatchObject({ ok: false });
    expect(zohoLeadUrl({ region: 'eu', org: 'org20123456' }, '5725767000000412001')).toBe('https://crm.zoho.eu/crm/org20123456/tab/Leads/5725767000000412001');
  });

  it('tags a link as the database does', () => {
    expect(taggedLink('https://qgr.example/call?from=social', 'abcd1234-0000-4000-8000-000000000000', 'A', 'facebook')).toBe(
      'https://qgr.example/call?from=social&utm_source=facebook&utm_medium=social&utm_campaign=qgr-abcd1234&utm_content=a-facebook',
    );
    expect(taggedLink('https://qgr.example/call', 'abcd1234-0000', 'C', 'linkedin')).toBe('https://qgr.example/call?utm_source=linkedin&utm_medium=social&utm_campaign=qgr-abcd1234&utm_content=c-linkedin');
  });

  it('holds the team’s words to the database’s rules', () => {
    expect(parseCriteria('  short ')).toMatchObject({ ok: false });
    expect(parseCriteria('A qualified lead can invest US$800,000.')).toEqual({ ok: true, value: 'A qualified lead can invest US$800,000.' });
    expect(parsePostLink('')).toEqual({ ok: true, value: null });
    expect(parsePostLink('http://qgr.example')).toMatchObject({ ok: false });
    expect(parsePostLink('https://qgr.example/call#book')).toMatchObject({ ok: false });
    expect(parseLeadVerdict('qualified', '  Funds   from a sale. ')).toEqual({ ok: true, value: { verdict: 'qualified', note: 'Funds from a sale.' } });
    expect(parseLeadVerdict(null, 'ignored')).toEqual({ ok: true, value: { verdict: null, note: null } });
    expect(parseLeadVerdict('unclear', '')).toMatchObject({ ok: false });
  });
});

describe('a post that asks for the link', () => {
  it('keeps the ask on Facebook and LinkedIn, never on Instagram', () => {
    const media = (n: number) => ({ path: `posts/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a0${n}.jpg`, kind: 'image' });
    const parsed = parseNewPost({
      variantId: 'v-pod-a',
      targets: [
        { place: 'facebook', media: media(1), link: true },
        { place: 'instagram', media: media(2), link: true },
        { place: 'linkedin', media: media(3), link: 'yes' },
      ],
      at: null,
      thumbnail: null,
    });
    expect(parsed.ok && parsed.value.targets.map((t) => [t.place, t.link ?? false])).toEqual([
      ['facebook', true],
      ['instagram', false],
      ['linkedin', false],
    ]);
  });
});
