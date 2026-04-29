import { Hono } from 'hono';
import type { Env, Channel } from '../lib/types';
import { requireApiKey } from '../lib/auth';
import { fetchWithTimeout } from '../lib/http';

type IptvOrgChannel = {
  id: string;
  name: string;
  country?: string | null;
  languages?: string[];
  categories?: string[];
};

const IPTV_ORG_URL = 'https://iptv-org.github.io/api/channels.json';
const IPTV_ORG_CACHE_KEY = new Request(
  'https://internal.tv-stream/iptv-org/channels-link.json'
);
let iptvOrgMemCache: { data: IptvOrgChannel[]; expiresAt: number } | null = null;

async function loadIptvOrgChannels(): Promise<IptvOrgChannel[]> {
  const now = Date.now();
  if (iptvOrgMemCache && now < iptvOrgMemCache.expiresAt) {
    return iptvOrgMemCache.data;
  }
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const cached = await cache.match(IPTV_ORG_CACHE_KEY);
      if (cached) {
        const data = (await cached.json()) as IptvOrgChannel[];
        iptvOrgMemCache = { data, expiresAt: now + 24 * 60 * 60 * 1000 };
        return data;
      }
    }
  } catch {
    /* ignore */
  }
  const res = await fetchWithTimeout(IPTV_ORG_URL, { timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`iptv-org channels.json ${res.status}`);
  const data = (await res.json()) as IptvOrgChannel[];
  iptvOrgMemCache = { data, expiresAt: now + 24 * 60 * 60 * 1000 };
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const fresh = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      });
      await cache.put(IPTV_ORG_CACHE_KEY, fresh);
    }
  } catch {
    /* ignore */
  }
  return data;
}

export const channelsRouter = new Hono<{ Bindings: Env }>({ strict: false });

// Slim projection for the public catalog endpoint. Excludes import-only and
// internal columns that no UI consumer reads from the list:
//   - tvg_id, group_title, tags, iptv_org_id (only matter on admin edit)
//   - error_count, last_error_at         (internal auto-deactivation state)
//   - created_at                          (not surfaced anywhere)
// Kept: stream_url (used by ChannelForm). For 600 channels this trims the
// payload roughly in half.
const CHANNEL_LIST_COLUMNS =
  'c.id, c.name, c.slug, c.stream_url, c.logo_url, c.category_id, ' +
  'c.is_active, c.source, c.is_direct, c.country, c.language, c.playlist_id';

channelsRouter.get('/', async (c) => {
  const activeOnly = c.req.query('active_only') !== 'false';
  const categorySlug = c.req.query('category_slug');

  let sql = `SELECT ${CHANNEL_LIST_COLUMNS} FROM channels c`;
  const params: unknown[] = [];
  const where: string[] = [];

  if (activeOnly) where.push('c.is_active = 1');
  if (categorySlug) {
    sql += ' INNER JOIN categories cat ON cat.id = c.category_id';
    where.push('cat.slug = ?');
    params.push(categorySlug);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY c.name';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Channel>();
  // Short browser TTL with SWR so a hard-refresh inside 15s reuses the
  // payload, but admin mutations propagated via chtv:channels-change still
  // surface within ~15s on other tabs.
  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=120');
  return c.json(results ?? []);
});

channelsRouter.get('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT * FROM channels WHERE id = ?').bind(id).first<Channel>();
  if (!row) return c.json({ error: 'Channel not found' }, 404);
  return c.json(row);
});

channelsRouter.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = await c.env.DB.prepare('SELECT * FROM channels WHERE slug = ?').bind(slug).first<Channel>();
  if (!row) return c.json({ error: 'Channel not found' }, 404);
  return c.json(row);
});

type ChannelInput = {
  name?: string;
  slug?: string;
  stream_url?: string;
  logo_url?: string | null;
  category_id?: number;
  is_active?: boolean;
};

channelsRouter.post('/', requireApiKey, async (c) => {
  const body = (await c.req.json()) as ChannelInput;
  if (!body.name || !body.slug || !body.stream_url || !body.category_id) {
    return c.json({ error: 'name, slug, stream_url, category_id required' }, 400);
  }
  const result = await c.env.DB
    .prepare('INSERT INTO channels (name, slug, stream_url, logo_url, category_id, is_active) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(body.name, body.slug, body.stream_url, body.logo_url ?? null, body.category_id, body.is_active === false ? 0 : 1)
    .run();
  const id = result.meta.last_row_id;
  const row = await c.env.DB.prepare('SELECT * FROM channels WHERE id = ?').bind(id).first<Channel>();
  return c.json(row, 201);
});

channelsRouter.put('/:id{[0-9]+}', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const body = (await c.req.json()) as ChannelInput;
  const fields: string[] = [];
  const params: unknown[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name); }
  if (body.slug !== undefined) { fields.push('slug = ?'); params.push(body.slug); }
  if (body.stream_url !== undefined) { fields.push('stream_url = ?'); params.push(body.stream_url); }
  if (body.logo_url !== undefined) { fields.push('logo_url = ?'); params.push(body.logo_url); }
  if (body.category_id !== undefined) { fields.push('category_id = ?'); params.push(body.category_id); }
  if (body.is_active !== undefined) { fields.push('is_active = ?'); params.push(body.is_active ? 1 : 0); }
  if (!fields.length) return c.json({ error: 'No fields to update' }, 400);
  params.push(id);
  const result = await c.env.DB.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  if (!result.meta.changes) return c.json({ error: 'Channel not found' }, 404);
  const row = await c.env.DB.prepare('SELECT * FROM channels WHERE id = ?').bind(id).first<Channel>();
  return c.json(row);
});

channelsRouter.delete('/:id{[0-9]+}', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const result = await c.env.DB.prepare('DELETE FROM channels WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return c.json({ error: 'Channel not found' }, 404);
  return new Response(null, { status: 204 });
});

// Public endpoint: the player calls this when a stream fails (HLS manifest
// load error, fatal media error, etc.). After 3 reports the channel is
// auto-deactivated so dead streams stop being recommended.
//
// SECURITY NOTE — TRUST BOUNDARY
// This endpoint intentionally has NO auth and NO rate limiting because CHTV
// is designed as a self-hosted, single-tenant deck (BYOM3U). Anyone with
// network access to the deck is assumed trusted. If the deployment is ever
// exposed to untrusted clients (public URL, multi-tenant), an attacker can
// disable any channel with three anonymous POSTs. Before going public, add:
//   - per-IP rate limiting via Cloudflare KV (e.g. 1 report / channel / hour)
//   - or an opaque session token issued at first page load
const ERROR_DEACTIVATE_THRESHOLD = 3;

channelsRouter.post('/:id{[0-9]+}/report-error', async (c) => {
  const id = Number(c.req.param('id'));

  // Atomic increment via UPDATE...RETURNING: avoids the read-then-write race
  // where two concurrent reports both read the same error_count and overwrite
  // each other. The WHERE clause also no-ops on already-inactive channels
  // and on missing ids in a single round trip.
  const updated = await c.env.DB
    .prepare(
      `UPDATE channels
         SET error_count = error_count + 1,
             last_error_at = datetime('now')
       WHERE id = ? AND is_active = 1
       RETURNING error_count`,
    )
    .bind(id)
    .first<{ error_count: number }>();

  if (!updated) {
    // Either the channel doesn't exist or is already inactive. Tell the client
    // either way — no further action needed.
    const exists = await c.env.DB
      .prepare('SELECT id FROM channels WHERE id = ?')
      .bind(id)
      .first<{ id: number }>();
    if (!exists) return c.json({ error: 'Channel not found' }, 404);
    return c.json({ deactivated: false, count: 0, already_off: true });
  }

  if (updated.error_count >= ERROR_DEACTIVATE_THRESHOLD) {
    // Threshold reached — deactivate and reset the counter so a future
    // re-activation starts fresh.
    await c.env.DB
      .prepare('UPDATE channels SET is_active = 0, error_count = 0 WHERE id = ?')
      .bind(id)
      .run();
    return c.json({ deactivated: true, count: 0, threshold: ERROR_DEACTIVATE_THRESHOLD });
  }

  return c.json({
    deactivated: false,
    count: updated.error_count,
    threshold: ERROR_DEACTIVATE_THRESHOLD,
  });
});

// Link a channel to its iptv-org master entry and pull missing metadata
// (country, language). Never overwrites user-edited fields.
channelsRouter.post('/:id{[0-9]+}/iptv-org-link', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const body = (await c.req.json().catch(() => ({}))) as { iptv_org_id?: string };
  const iptvOrgId = (body.iptv_org_id ?? '').trim();
  if (!iptvOrgId || iptvOrgId.length > 100) {
    return c.json({ error: 'iptv_org_id required (1-100 chars)' }, 400);
  }

  const channel = await c.env.DB
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(id)
    .first<Channel>();
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  let dataset: IptvOrgChannel[];
  try {
    dataset = await loadIptvOrgChannels();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return c.json({ error: `iptv-org dataset unavailable: ${msg}` }, 502);
  }

  const entry = dataset.find((e) => e.id === iptvOrgId);
  if (!entry) {
    return c.json({ error: `${iptvOrgId} not found in iptv-org` }, 422);
  }

  // Apply only to fields the user has not set (do not overwrite curated data).
  const applied: Record<string, boolean> = {
    country: false,
    language: false,
  };
  const fields: string[] = ['iptv_org_id = ?'];
  const params: unknown[] = [iptvOrgId];

  if (!channel.country && entry.country) {
    fields.push('country = ?');
    params.push(entry.country);
    applied.country = true;
  }
  if (!channel.language && entry.languages?.[0]) {
    fields.push('language = ?');
    params.push(entry.languages[0]);
    applied.language = true;
  }

  params.push(id);
  await c.env.DB
    .prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  const row = await c.env.DB
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(id)
    .first<Channel>();

  return c.json({ channel: row, applied });
});
