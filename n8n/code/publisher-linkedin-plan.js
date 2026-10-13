// A post on the LinkedIn Page through its Posts API, as the Page
// (urn:li:organization:{id}). A picture or a video is uploaded to LinkedIn
// first and the post names it. The API version is pinned: LinkedIn keeps each
// one a year (202609 until about September 2027), so move it on before then.
// The words go in LinkedIn's "little" text format, where \ | { } @ [ ] ( ) < >
// # * _ ~ mean something: they are escaped, so the post reads as written.
const VERSION = '202609';

function little(text) {
  return String(text || '').replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&');
}

return $input.all().map(function (item) {
  const p = item.json;
  const owner = 'urn:li:organization:' + String(p.page.id);
  const kind = p.media_url ? (p.media_kind === 'video' ? 'video' : 'image') : 'none';
  return {
    json: {
      ok: true,
      post_id: p.post_id,
      place: p.place,
      owner: owner,
      kind: kind,
      version: VERSION,
      media_url: p.media_url,
      post: {
        author: owner,
        commentary: little(p.text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
    },
  };
});
