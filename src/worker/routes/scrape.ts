import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { fetchWithTimeout } from '../lib/http';

/**
 * Discovery scrapers — turn community aggregator websites into a synthetic
 * M3U so they can be imported through the existing playlist sync flow.
 *
 * The frontend creates a playlist whose URL is one of these endpoints
 * (e.g. `/api/import/scrape/tvtvhd.m3u`). When the user hits "Sync" later,
 * the playlist re-fetches this endpoint, the worker re-scrapes the source,
 * and channels stay reasonably fresh.
 *
 * IMPORTANT — TRUST BOUNDARY:
 * These sources host streams of premium channels without a license. Whether
 * to enable them is the deployment operator's call (CHTV is BYOM3U). The
 * scrapers are implemented as a separate router so the legality concern
 * stays explicit at the route layer.
 */
export const scrapeRouter = new Hono<{ Bindings: Env }>({ strict: false });

// ---------- helpers ----------

// Quote-safe value for an EXTINF attribute. M3U attributes are simple but
// strings with quotes break parsers down the line.
function attr(s: string): string {
  return String(s ?? '').replace(/"/g, '');
}

// Map tvtvhd's regional buckets → ISO 3166 alpha-2 country code so the
// imported channels show flags in CHTV's UI. Spanish-language groups use
// their own ISO codes; "MUNDO" and "LATINOAMERICA" stay null.
const TVTVHD_COUNTRY: Record<string, string | null> = {
  ARGENTINA: 'AR',
  PERÚ: 'PE',
  PERU: 'PE',
  COLOMBIA: 'CO',
  MÉXICO: 'MX',
  MEXICO: 'MX',
  USA: 'US',
  CHILE: 'CL',
  BRASIL: 'BR',
  BRAZIL: 'BR',
  PORTUGAL: 'PT',
  ESPAÑA: 'ES',
  ESPANA: 'ES',
  LATINOAMERICA: null,
  MUNDO: null,
};

type TvtvhdChannel = {
  Canal: string;
  Estado: 'Activo' | 'Inactivo';
  Link: string;
};

type TvtvhdResponse = Record<string, TvtvhdChannel[]>;

// ---------- GET /scrape/tvtvhd.m3u ----------
// Fetches https://tvtvhd.com/status.json and emits a synthetic M3U.
// Query params:
//   active=1 (default 1) — only include `Estado === 'Activo'` channels
scrapeRouter.get('/tvtvhd.m3u', async (c) => {
  const activeOnly = c.req.query('active') !== '0';

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout('https://tvtvhd.com/status.json', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://tvtvhd.com/',
      },
      timeoutMs: 15_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return c.text(`# tvtvhd unreachable: ${msg}\n`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
    });
  }
  if (!upstream.ok) {
    return c.text(`# tvtvhd status ${upstream.status}\n`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
    });
  }

  let data: TvtvhdResponse;
  try {
    data = (await upstream.json()) as TvtvhdResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return c.text(`# tvtvhd invalid JSON: ${msg}\n`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
    });
  }

  const lines: string[] = ['#EXTM3U'];
  for (const [group, channels] of Object.entries(data)) {
    if (!Array.isArray(channels)) continue;
    const country = TVTVHD_COUNTRY[group.toUpperCase()] ?? null;
    for (const ch of channels) {
      if (activeOnly && ch.Estado !== 'Activo') continue;
      if (!ch?.Link || !ch?.Canal) continue;
      const slugMatch = ch.Link.match(/stream=([^&]+)/);
      const slug = slugMatch?.[1];
      if (!slug) continue;

      const attrs: string[] = [
        `tvg-id="${attr(slug)}"`,
        `group-title="${attr(group)}"`,
      ];
      if (country) attrs.push(`tvg-country="${country}"`);

      lines.push(`#EXTINF:-1 ${attrs.join(' ')},${attr(ch.Canal)}`);
      lines.push(ch.Link);
    }
  }

  // Short cache so repeated syncs (e.g. the auto-sync after create) don't
  // hammer tvtvhd and the second-soon hit is local.
  return c.text(lines.join('\n') + '\n', 200, {
    'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
    'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
    'X-Source': 'tvtvhd',
  });
});

// ---------- GET /scrape/list ----------
// Lightweight discovery: tells the frontend which scrapers are available
// so the chip rail can be data-driven instead of hard-coding URLs in JS.
scrapeRouter.get('/list', (c) =>
  c.json([
    {
      id: 'tvtvhd',
      label: 'tvtvhd',
      description:
        'Agregador comunitario hispano (ESPN, DSports, Movistar…). Streams scraped — calidad y disponibilidad fluctúa.',
      url: '/api/import/scrape/tvtvhd.m3u',
      source: 'tvtvhd',
      is_direct: false,
      official: false,
    },
  ]),
);
