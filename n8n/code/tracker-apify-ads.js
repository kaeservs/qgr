// Apify's answer: the competitor's ads from Meta's Ad Library, one item each,
// as the Facebook Ads Library Scraper gives them, turned into the shape the
// sample ads have. The actor's versions name fields differently (adArchiveID
// or ad_archive_id, ctaText or cta_text, a start date in seconds or as a
// date), so each is read whichever way it comes. A search is kept to the
// competitor's own ads: from a Page with their name, or linking to their
// website. An ad whose words are a template (a catalogue ad) has nothing to
// read and is left out.
const plan = $('Plan the scan').first().json;
const keep = plan.library && plan.library.keep;

function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (let i = 0; i < names.length; i += 1) {
    const v = obj[names[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
function words(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (v.markup && typeof v.markup.__html === 'string') return v.markup.__html.replace(/<[^>]*>/g, ' ');
  }
  return '';
}
function clean(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}
function isoDate(v) {
  if (typeof v === 'number' && isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === 'string' && /^\d+$/.test(v)) return isoDate(Number(v));
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}
function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ''));
  return m ? m[1].replace(/^www\./, '').toLowerCase() : null;
}
// Meta sends outbound links through l.facebook.com/l.php?u=<the link>.
function unwrap(url) {
  const m = /[?&]u=([^&#]+)/.exec(String(url || ''));
  if (!m || !/(^|\.)facebook\.com$/.test(hostOf(url) || '')) return url;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return url;
  }
}
function squash(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// "Horizon Visa" is "Horizon Visa Partners"; short names must match whole.
function sameName(a, b) {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  if (x.length < 5 || y.length < 5) return x === y;
  return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
}
function theirs(pageName, link) {
  if (!keep) return true;
  if (keep.name && sameName(pageName, keep.name)) return true;
  const h = hostOf(link);
  return !!(keep.domain && h && (h === keep.domain || h.slice(-keep.domain.length - 1) === '.' + keep.domain));
}
// A catalogue ad's headline can be its unfilled template ({{product.name}}).
function untemplated(text) {
  return text && text.indexOf('{{') === -1 ? text : null;
}
function first(list) {
  return Array.isArray(list) && list.length > 0 && list[0] && typeof list[0] === 'object' ? list[0] : {};
}
const FORMATS = { VIDEO: 'video', IMAGE: 'image', CAROUSEL: 'carousel', MULTI_IMAGES: 'carousel', DCO: 'carousel', DPA: 'carousel', TEXT: 'text' };

let returned = 0;
const seen = {};
const ads = [];
$input.all().forEach(function (item) {
  const a = item.json;
  const archiveId = pick(a, ['adArchiveID', 'adArchiveId', 'ad_archive_id']);
  const id = archiveId || pick(a, ['adId', 'ad_id', 'id']);
  // An empty answer comes through as one empty item: no ads.
  if (!id) return;
  returned += 1;
  if (seen[id]) return;
  seen[id] = true;

  const snap = a.snapshot && typeof a.snapshot === 'object' ? a.snapshot : {};
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const card = first(cards);
  let text = clean(words(pick(snap, ['body'])) || words(pick(a, ['body', 'adCreativeBody', 'ad_creative_body', 'text'])));
  if (!text || text.indexOf('{{') !== -1) text = clean(words(pick(card, ['body'])));
  if (!text || text.indexOf('{{') !== -1) return;

  const pageName = clean(pick(a, ['pageName', 'page_name']) || pick(snap, ['pageName', 'page_name']));
  const link = unwrap(pick(snap, ['linkUrl', 'link_url']) || pick(card, ['linkUrl', 'link_url']) || pick(a, ['linkUrl', 'link_url']));
  if (!theirs(pageName, link)) return;

  const display = String(pick(snap, ['displayFormat', 'display_format']) || pick(a, ['displayFormat', 'display_format']) || '').toUpperCase();
  const videos = Array.isArray(snap.videos) ? snap.videos : [];
  const images = Array.isArray(snap.images) ? snap.images : [];
  const format = FORMATS[display] || (videos.length > 0 ? 'video' : cards.length > 1 ? 'carousel' : images.length > 0 ? 'image' : 'text');
  const video = first(videos);
  const image = first(images);
  const media =
    pick(video, ['videoPreviewImageUrl', 'video_preview_image_url']) ||
    pick(image, ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url']) ||
    pick(card, ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url', 'videoPreviewImageUrl', 'video_preview_image_url']);

  ads.push({
    id: String(id),
    platform: 'meta',
    format: format,
    startDate: isoDate(pick(a, ['startDate', 'start_date', 'adDeliveryStartTime', 'ad_delivery_start_time'])),
    isActive: pick(a, ['isActive', 'is_active']) !== false,
    pageName: pageName || null,
    text: text,
    headline: untemplated(clean(words(pick(snap, ['title'])))) || untemplated(clean(words(pick(card, ['title'])))),
    cta: clean(pick(snap, ['ctaText', 'cta_text']) || pick(card, ['ctaText', 'cta_text'])) || null,
    adUrl: archiveId && /^\d+$/.test(String(archiveId)) ? 'https://www.facebook.com/ads/library/?id=' + archiveId : null,
    mediaUrl: typeof media === 'string' && /^https:\/\//.test(media) ? media : null,
  });
});

const where = plan.library && plan.library.query ? 'for "' + plan.library.query + '"' : 'at that link';
if (returned === 0) {
  throw new Error("Meta's Ad Library has no active ads " + where + '.');
}
if (ads.length === 0) {
  throw new Error(
    keep
      ? "Meta's Ad Library has ads " + where + ', but none from ' + (keep.name || keep.domain) + "'s Page or linking to their website. Start the run from a link to their ads in Meta's Ad Library."
      : 'Apify gave back ads with no words to read.',
  );
}
return [{ json: Object.assign({}, plan, { dataSource: 'apify', ads: ads }) }];
