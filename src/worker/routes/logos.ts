import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { requireApiKey } from '../lib/auth';
import { fetchWithTimeout } from '../lib/http';

type DBChannel = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
};

type Proposal = {
  channel_id: number;
  channel_name: string;
  current_logo: string | null;
  match: {
    id: string;
    name: string;
    country: string | null;
    network: string | null;
    logo: string;
    score: number;
  } | null;
  skip_reason?: 'has_logo' | 'no_match' | 'low_score';
};

type BulkFillBody = {
  apply?: boolean;
  overwrite?: boolean;
  min_score?: number;
  preferred_country?: string;
  channel_ids?: number[];
};

type IptvOrgChannel = {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  country?: string | null;
  categories?: string[];
};

type IptvOrgLogo = {
  channel: string;
  feed?: string | null;
  in_use?: boolean;
  width?: number;
  height?: number;
  url: string;
};

type ChannelWithLogo = {
  id: string;
  name: string;
  alt_names: string[];
  network: string | null;
  country: string | null;
  categories: string[];
  logo: string;
};

type LogoResult = {
  id: string;
  name: string;
  country: string | null;
  network: string | null;
  categories: string[];
  logo: string;
};

const CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';
const LOGOS_URL = 'https://iptv-org.github.io/api/logos.json';
const CACHE_KEY = new Request('https://internal.tv-stream/iptv-org/joined.json');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const FETCH_TIMEOUT_MS = 20_000;

// Module-level memory cache (per-isolate). Survives across requests on the same Worker instance.
let memoryDataset: { data: ChannelWithLogo[]; expiresAt: number } | null = null;
// Inflight promise to coalesce concurrent requests into a single upstream fetch.
let inflight: Promise<ChannelWithLogo[]> | null = null;

function getDefaultCache(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    return null;
  }
}

async function buildJoinedDataset(): Promise<ChannelWithLogo[]> {
  const [channelsRes, logosRes] = await Promise.all([
    fetchWithTimeout(CHANNELS_URL, { timeoutMs: FETCH_TIMEOUT_MS }),
    fetchWithTimeout(LOGOS_URL, { timeoutMs: FETCH_TIMEOUT_MS }),
  ]);
  if (!channelsRes.ok) throw new Error(`channels.json ${channelsRes.status}`);
  if (!logosRes.ok) throw new Error(`logos.json ${logosRes.status}`);

  const [channels, logos] = await Promise.all([
    channelsRes.json() as Promise<IptvOrgChannel[]>,
    logosRes.json() as Promise<IptvOrgLogo[]>,
  ]);

  const byChannel = new Map<string, IptvOrgLogo>();
  for (const l of logos) {
    if (!l.url) continue;
    const existing = byChannel.get(l.channel);
    if (!existing) {
      byChannel.set(l.channel, l);
      continue;
    }
    const existingScore = (existing.in_use ? 2 : 0) + (existing.feed ? 0 : 1);
    const candScore = (l.in_use ? 2 : 0) + (l.feed ? 0 : 1);
    if (candScore > existingScore) byChannel.set(l.channel, l);
  }

  const out: ChannelWithLogo[] = [];
  for (const c of channels) {
    const logo = byChannel.get(c.id);
    if (!logo) continue;
    out.push({
      id: c.id,
      name: c.name,
      alt_names: c.alt_names ?? [],
      network: c.network ?? null,
      country: c.country ?? null,
      categories: c.categories ?? [],
      logo: logo.url,
    });
  }
  return out;
}

async function getDataset(): Promise<ChannelWithLogo[]> {
  const now = Date.now();

  // 1. Memory cache (fastest)
  if (memoryDataset && now < memoryDataset.expiresAt) {
    return memoryDataset.data;
  }

  // 2. Cache API (Workers edge cache)
  const cache = getDefaultCache();
  if (cache) {
    try {
      const cached = await cache.match(CACHE_KEY);
      if (cached) {
        const data = (await cached.json()) as ChannelWithLogo[];
        memoryDataset = { data, expiresAt: now + CACHE_TTL_MS };
        return data;
      }
    } catch {
      // Cache may be unavailable in some dev contexts; ignore.
    }
  }

  // 3. Coalesce concurrent upstream fetches
  if (!inflight) {
    inflight = (async () => {
      try {
        const data = await buildJoinedDataset();
        memoryDataset = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        if (cache) {
          try {
            const fresh = new Response(JSON.stringify(data), {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
              },
            });
            await cache.put(CACHE_KEY, fresh);
          } catch {
            // ignore
          }
        }
        return data;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function scoreChannel(channel: ChannelWithLogo, q: string): number {
  const name = normalize(channel.name || '');
  if (!name) return 0;

  if (name === q) return 100;
  if (name.startsWith(q)) return 80;

  const words = name.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 60;

  if (name.includes(q)) return 40;

  for (const alt of channel.alt_names) {
    const a = normalize(alt);
    if (!a) continue;
    if (a === q) return 70;
    if (a.startsWith(q)) return 50;
    if (a.includes(q)) return 30;
  }

  if (channel.network) {
    const net = normalize(channel.network);
    if (net === q) return 25;
    if (net.includes(q)) return 15;
  }

  return 0;
}

export const logosRouter = new Hono<{ Bindings: Env }>({ strict: false });

logosRouter.get('/search', async (c) => {
  const qRaw = (c.req.query('q') || '').trim();
  const q = normalize(qRaw);

  if (!q || q.length < 2) {
    return c.json({ results: [] });
  }

  const limit = Math.min(Math.max(Number(c.req.query('limit') || 30), 1), 60);

  let dataset: ChannelWithLogo[];
  try {
    dataset = await getDataset();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn('[logos] upstream failed:', message);
    return c.json(
      { error: 'No se pudo contactar la fuente externa de logos', detail: message },
      502
    );
  }

  const matches: { ch: ChannelWithLogo; s: number }[] = [];
  for (const ch of dataset) {
    const s = scoreChannel(ch, q);
    if (s > 0) matches.push({ ch, s });
  }

  matches.sort((a, b) => b.s - a.s);

  const results: LogoResult[] = matches.slice(0, limit).map(({ ch }) => ({
    id: ch.id,
    name: ch.name,
    country: ch.country,
    network: ch.network,
    categories: ch.categories,
    logo: ch.logo,
  }));

  return c.json({ results }, { headers: { 'Cache-Control': 'public, max-age=300' } });
});

// Find best match for a channel name. Score must be ≥ minScore to count.
// `preferredCountry` is upper-case ISO (e.g. "MX"). If a match in that country
// exists with the top score, prefer it over equal-scored matches in other countries.
function findBestMatchFor(
  dataset: ChannelWithLogo[],
  channelName: string,
  minScore: number,
  preferredCountry: string | null
): { ch: ChannelWithLogo; score: number } | null {
  const q = normalize(channelName);
  if (!q || q.length < 2) return null;

  let best: { ch: ChannelWithLogo; score: number } | null = null;
  let bestPreferred: { ch: ChannelWithLogo; score: number } | null = null;

  for (const ch of dataset) {
    const s = scoreChannel(ch, q);
    if (s < minScore) continue;
    if (!best || s > best.score) best = { ch, score: s };
    if (preferredCountry && ch.country === preferredCountry) {
      if (!bestPreferred || s > bestPreferred.score) {
        bestPreferred = { ch, score: s };
      }
    }
  }

  // If preferred-country has a match within 20 points of best, prefer it
  if (bestPreferred && best && bestPreferred.score >= best.score - 20) {
    return bestPreferred;
  }
  return best;
}

logosRouter.post('/bulk-fill', requireApiKey, async (c) => {
  let body: BulkFillBody = {};
  try {
    body = (await c.req.json()) as BulkFillBody;
  } catch {
    body = {};
  }

  const apply = body.apply === true;
  const overwrite = body.overwrite === true;
  const minScore = Math.max(1, Math.min(100, Number(body.min_score) || 60));
  const preferredCountry = body.preferred_country
    ? String(body.preferred_country).toUpperCase().slice(0, 4)
    : null;
  const onlyIds = Array.isArray(body.channel_ids)
    ? body.channel_ids.filter((n) => Number.isFinite(n)).map(Number)
    : null;

  // Fetch dataset from cache (memory or upstream)
  let dataset: ChannelWithLogo[];
  try {
    dataset = await getDataset();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return c.json(
      { error: 'No se pudo contactar la fuente externa de logos', detail: message },
      502
    );
  }

  // Load all channels from D1
  const { results: allChannels } = await c.env.DB
    .prepare('SELECT id, name, slug, logo_url FROM channels ORDER BY name')
    .all<DBChannel>();
  const channels = (allChannels ?? []).filter((ch) => {
    if (onlyIds && !onlyIds.includes(ch.id)) return false;
    return true;
  });

  // Build proposals
  const proposals: Proposal[] = [];
  let eligible = 0;
  let matched = 0;

  for (const ch of channels) {
    const hasLogo = !!(ch.logo_url && ch.logo_url.trim());
    if (hasLogo && !overwrite) {
      proposals.push({
        channel_id: ch.id,
        channel_name: ch.name,
        current_logo: ch.logo_url,
        match: null,
        skip_reason: 'has_logo',
      });
      continue;
    }
    eligible += 1;

    const best = findBestMatchFor(dataset, ch.name, minScore, preferredCountry);
    if (!best) {
      proposals.push({
        channel_id: ch.id,
        channel_name: ch.name,
        current_logo: ch.logo_url,
        match: null,
        skip_reason: minScore > 1 ? 'low_score' : 'no_match',
      });
      continue;
    }
    matched += 1;
    proposals.push({
      channel_id: ch.id,
      channel_name: ch.name,
      current_logo: ch.logo_url,
      match: {
        id: best.ch.id,
        name: best.ch.name,
        country: best.ch.country,
        network: best.ch.network,
        logo: best.ch.logo,
        score: best.score,
      },
    });
  }

  let applied = 0;
  if (apply) {
    const stmts = proposals
      .filter((p) => p.match)
      .map((p) =>
        c.env.DB
          .prepare('UPDATE channels SET logo_url = ? WHERE id = ?')
          .bind(p.match!.logo, p.channel_id)
      );
    if (stmts.length > 0) {
      const batchResults = await c.env.DB.batch(stmts);
      applied = batchResults.reduce(
        (acc, r) => acc + (r?.meta?.changes ?? 0),
        0
      );
    }
  }

  return c.json({
    proposals,
    summary: {
      total_channels: channels.length,
      eligible,
      matched,
      applied: apply ? applied : undefined,
      apply,
      overwrite,
      min_score: minScore,
      preferred_country: preferredCountry,
    },
  });
});
