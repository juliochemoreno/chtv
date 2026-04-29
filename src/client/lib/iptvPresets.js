// Curated public M3U sources users can import in 1 click.
//
// Three providers are surfaced today:
//
//   - IPTV-ORG: huge community catalog (iptv-org/iptv on GitHub). Streams
//     are crowd-sourced, hosted on free CDNs and rotate frequently — high
//     count but spotty quality.
//
//   - FREE-TV: alternative community catalog (Free-TV/IPTV on GitHub) with
//     more active curation. Smaller per-country, but historically fewer
//     dead streams than iptv-org.
//
//   - FAST (Free Ad-Supported TV): NZ/AU FAST channels via mjh.nz. The
//     only mjh.nz URL that actually serves an M3U; mjh's per-service
//     endpoints (Pluto/Samsung/Plex) only ship EPG (.xml), not playlists.
//
// Each entry mirrors the M3U Import endpoint shape so the worker side
// doesn't need to know about the providers.
const RAW_PRESETS = [
  // ── IPTV-ORG by country ───────────────────────────────────────────
  { provider: 'iptv-org', label: 'México',      sub: '~130 canales', url: 'https://iptv-org.github.io/iptv/countries/mx.m3u', source: 'iptv-org', country: 'MX', category_slug: null, is_direct: true },
  { provider: 'iptv-org', label: 'Argentina',   sub: '~130 canales', url: 'https://iptv-org.github.io/iptv/countries/ar.m3u', source: 'iptv-org', country: 'AR', category_slug: null, is_direct: true },
  { provider: 'iptv-org', label: 'Colombia',    sub: '~110 canales', url: 'https://iptv-org.github.io/iptv/countries/co.m3u', source: 'iptv-org', country: 'CO', category_slug: null, is_direct: true },
  { provider: 'iptv-org', label: 'España',      sub: '~270 canales', url: 'https://iptv-org.github.io/iptv/countries/es.m3u', source: 'iptv-org', country: 'ES', category_slug: null, is_direct: true },
  { provider: 'iptv-org', label: 'USA',         sub: '~600 canales', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', source: 'iptv-org', country: 'US', category_slug: null, is_direct: true },
  { provider: 'iptv-org', label: 'Brasil',      sub: '~210 canales', url: 'https://iptv-org.github.io/iptv/countries/br.m3u', source: 'iptv-org', country: 'BR', category_slug: null, is_direct: true },

  // ── IPTV-ORG by category ──────────────────────────────────────────
  { provider: 'iptv-org', label: 'Sports',      sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u',      source: 'iptv-org', country: null, category_slug: 'sports',      is_direct: true },
  { provider: 'iptv-org', label: 'News',        sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/news.m3u',        source: 'iptv-org', country: null, category_slug: 'news',        is_direct: true },
  { provider: 'iptv-org', label: 'Movies',      sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',      source: 'iptv-org', country: null, category_slug: 'movies',      is_direct: true },
  { provider: 'iptv-org', label: 'Music',       sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/music.m3u',       source: 'iptv-org', country: null, category_slug: 'music',       is_direct: true },
  { provider: 'iptv-org', label: 'Kids',        sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u',        source: 'iptv-org', country: null, category_slug: 'kids',        is_direct: true },
  { provider: 'iptv-org', label: 'Documentary', sub: 'global', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u', source: 'iptv-org', country: null, category_slug: 'documentary', is_direct: true },

  // ── Free-TV/IPTV — alternative community catalog (more active curation) ──
  { provider: 'free-tv', label: 'México',    sub: 'curada',           url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_mexico.m3u8',    source: 'free-tv', country: 'MX', category_slug: null, is_direct: true },
  { provider: 'free-tv', label: 'Argentina', sub: 'curada',           url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_argentina.m3u8', source: 'free-tv', country: 'AR', category_slug: null, is_direct: true },
  { provider: 'free-tv', label: 'España',    sub: 'curada',           url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_spain.m3u8',     source: 'free-tv', country: 'ES', category_slug: null, is_direct: true },
  { provider: 'free-tv', label: 'USA',       sub: 'curada',           url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_usa.m3u8',       source: 'free-tv', country: 'US', category_slug: null, is_direct: true },

  // ── FAST (NZ/AU only — mjh.nz scope) ────────────────────────────────
  // Includes Sky/ThreeNow/Foxtel-style NZ+AU FAST channels. The bulk of
  // mjh.nz's other "PlutoTV / SamsungTVPlus / Plex / Stirr" directories
  // only publish EPG (.xml), not playable M3U — that's why those URLs
  // returned 404 in the previous version.
  { provider: 'fast', label: 'NZ + AU (mjh.nz)', sub: '~290 canales · oficial', url: 'https://i.mjh.nz/all/raw-tv.m3u8', source: 'mjh-nz', country: null, category_slug: null, is_direct: true },

  // ── SCRAPER (community aggregators — non-official) ────────────────
  // The URL points at our own worker endpoint, which scrapes the source
  // and returns a synthetic M3U. Streams resolve via /api/streams scraping
  // (is_direct: false) because the upstream serves HTML, not direct m3u8.
  { provider: 'scraper', label: 'tvtvhd', sub: '~50 canales · no oficial', url: '/api/import/scrape/tvtvhd.m3u', source: 'tvtvhd', country: null, category_slug: null, is_direct: false },
];

export const IPTV_ORG_PRESETS = RAW_PRESETS.filter((p) => p.provider === 'iptv-org');
export const FREE_TV_PRESETS = RAW_PRESETS.filter((p) => p.provider === 'free-tv');
export const FAST_PRESETS = RAW_PRESETS.filter((p) => p.provider === 'fast');
export const SCRAPER_PRESETS = RAW_PRESETS.filter((p) => p.provider === 'scraper');
export const ALL_PRESETS = RAW_PRESETS;

// Subset shown on the Home OFF-AIR screen — keep it short so it doesn't
// compete with the broadcast aesthetic. Colombia is pinned first; the
// remaining 2 slots are randomized from any provider so first-time users
// see a mix.
const QUICK_PINNED_LABELS = ['Colombia'];
const QUICK_TARGET_COUNT = 3;

function pickRandom(arr, n) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0 && out.length - i <= n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(-n);
}

export function getQuickPresets() {
  // Pinned Colombia is always from iptv-org (Free-TV doesn't have a CO
  // playlist; FAST is NZ/AU only).
  const pinned = QUICK_PINNED_LABELS
    .map((label) =>
      ALL_PRESETS.find((p) => p.label === label && p.provider === 'iptv-org'),
    )
    .filter(Boolean);
  const pool = ALL_PRESETS.filter(
    (p) => !pinned.some((q) => q.label === p.label && q.provider === p.provider),
  );
  const need = Math.max(0, QUICK_TARGET_COUNT - pinned.length);
  return [...pinned, ...pickRandom(pool, need)];
}
