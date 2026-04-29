import { Hono } from 'hono';
import type { Env, Playlist, PlaylistInput } from '../lib/types';
import { requireApiKey } from '../lib/auth';
import { fetchWithTimeout } from '../lib/http';
import { parseM3u, slugify } from '../lib/m3u';

export const playlistsRouter = new Hono<{ Bindings: Env }>({ strict: false });

// ---------- helpers ----------

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function recountPlaylist(env: Env, playlistId: number): Promise<number> {
  const row = await env.DB
    .prepare('SELECT COUNT(*) as n FROM channels WHERE playlist_id = ?')
    .bind(playlistId)
    .first<{ n: number }>();
  const n = row?.n ?? 0;
  await env.DB
    .prepare('UPDATE playlists SET channel_count = ? WHERE id = ?')
    .bind(n, playlistId)
    .run();
  return n;
}

// ---------- list / get ----------

playlistsRouter.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM playlists ORDER BY name')
    .all<Playlist>();
  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=120');
  return c.json(results ?? []);
});

playlistsRouter.get('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .bind(id)
    .first<Playlist>();
  if (!row) return c.json({ error: 'Playlist not found' }, 404);
  return c.json(row);
});

// ---------- create ----------

playlistsRouter.post('/', requireApiKey, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as PlaylistInput;

  const name = (body.name ?? '').trim();
  const url = (body.url ?? '').trim();

  if (!name) return c.json({ error: 'name required' }, 400);
  if (name.length > 200) return c.json({ error: 'name too long (max 200)' }, 400);
  if (!url || !isValidUrl(url)) return c.json({ error: 'valid url required' }, 400);

  const result = await c.env.DB
    .prepare(
      `INSERT INTO playlists
         (name, url, source, is_direct, default_category_id, default_country,
          channel_count, auto_sync)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .bind(
      name,
      url,
      body.source ?? 'm3u',
      body.is_direct === false ? 0 : 1,
      body.default_category_id ?? null,
      body.default_country ?? null,
      body.auto_sync ? 1 : 0
    )
    .run();

  const id = result.meta.last_row_id;
  const row = await c.env.DB
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .bind(id)
    .first<Playlist>();
  return c.json(row, 201);
});

// ---------- update ----------

playlistsRouter.put('/:id{[0-9]+}', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const body = (await c.req.json().catch(() => ({}))) as PlaylistInput;

  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return c.json({ error: 'name cannot be empty' }, 400);
    if (name.length > 200) return c.json({ error: 'name too long (max 200)' }, 400);
    fields.push('name = ?');
    params.push(name);
  }
  if (body.url !== undefined) {
    if (!isValidUrl(body.url)) return c.json({ error: 'invalid url' }, 400);
    fields.push('url = ?');
    params.push(body.url);
  }
  if (body.source !== undefined) {
    fields.push('source = ?');
    params.push(body.source);
  }
  if (body.is_direct !== undefined) {
    fields.push('is_direct = ?');
    params.push(body.is_direct ? 1 : 0);
  }
  if (body.default_category_id !== undefined) {
    fields.push('default_category_id = ?');
    params.push(body.default_category_id);
  }
  if (body.default_country !== undefined) {
    fields.push('default_country = ?');
    params.push(body.default_country);
  }
  if (body.auto_sync !== undefined) {
    fields.push('auto_sync = ?');
    params.push(body.auto_sync ? 1 : 0);
  }

  if (!fields.length) return c.json({ error: 'no fields to update' }, 400);
  params.push(id);

  const result = await c.env.DB
    .prepare(`UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  if (!result.meta.changes) return c.json({ error: 'Playlist not found' }, 404);

  const row = await c.env.DB
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .bind(id)
    .first<Playlist>();
  return c.json(row);
});

// ---------- delete ----------

playlistsRouter.delete('/:id{[0-9]+}', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const cascade = c.req.query('cascade') === 'channels';

  // Ensure it exists first
  const exists = await c.env.DB
    .prepare('SELECT id FROM playlists WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!exists) return c.json({ error: 'Playlist not found' }, 404);

  if (cascade) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM channels WHERE playlist_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id),
    ]);
  } else {
    // FK ON DELETE SET NULL handles channels.playlist_id; just delete playlist.
    await c.env.DB
      .prepare('DELETE FROM playlists WHERE id = ?')
      .bind(id)
      .run();
  }

  return new Response(null, { status: 204 });
});

// ---------- sync ----------

playlistsRouter.post('/:id{[0-9]+}/sync', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const playlist = await c.env.DB
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .bind(id)
    .first<Playlist>();

  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  // Fetch upstream M3U
  let text: string;
  try {
    const upstream = await fetchWithTimeout(playlist.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
      timeoutMs: 30_000,
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    text = await upstream.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await c.env.DB
      .prepare(
        `UPDATE playlists
           SET last_synced_at = datetime('now'), last_sync_status = ?
         WHERE id = ?`
      )
      .bind(`error: ${msg}`, id)
      .run();
    return c.json({ error: `sync failed: ${msg}`, status: 'error' }, 502);
  }

  const entries = parseM3u(text);
  if (!entries.length) {
    await c.env.DB
      .prepare(
        `UPDATE playlists SET last_synced_at = datetime('now'),
           last_sync_status = 'error: empty playlist' WHERE id = ?`
      )
      .bind(id)
      .run();
    return c.json({ error: 'playlist returned 0 entries', status: 'error' }, 422);
  }

  // Existing channels keyed by tvg_id (preferred) or slug.
  const { results: existing } = await c.env.DB
    .prepare(
      'SELECT id, name, slug, stream_url, logo_url, tvg_id, is_active FROM channels WHERE playlist_id = ?'
    )
    .bind(id)
    .all<{
      id: number;
      name: string;
      slug: string;
      stream_url: string;
      logo_url: string | null;
      tvg_id: string | null;
      is_active: number;
    }>();

  const byTvgId = new Map<string, (typeof existing)[number]>();
  const bySlug = new Map<string, (typeof existing)[number]>();
  for (const ch of existing ?? []) {
    if (ch.tvg_id) byTvgId.set(ch.tvg_id, ch);
    bySlug.set(ch.slug, ch);
  }

  // Resolve a fallback category id (default of playlist or "general").
  let fallbackCatId = playlist.default_category_id;
  if (!fallbackCatId) {
    const general = await c.env.DB
      .prepare("SELECT id FROM categories WHERE slug = 'general'")
      .first<{ id: number }>();
    fallbackCatId = general?.id ?? 1;
  }

  // Pre-load all category slugs for group-title → category mapping
  const catRows = await c.env.DB
    .prepare('SELECT id, slug FROM categories')
    .all<{ id: number; slug: string }>();
  const catBySlug = new Map<string, number>();
  for (const r of catRows.results ?? []) {
    catBySlug.set(r.slug.toLowerCase(), r.id);
  }

  // Pre-load all used slugs (so we can avoid collisions when generating new ones)
  const allSlugs = await c.env.DB
    .prepare('SELECT slug FROM channels')
    .all<{ slug: string }>();
  const usedSlugs = new Set<string>();
  for (const r of allSlugs.results ?? []) usedSlugs.add(r.slug);

  let added = 0;
  let updated = 0;
  let deactivated = 0;
  const seenIds = new Set<number>();
  const adds: D1PreparedStatement[] = [];
  const updates: D1PreparedStatement[] = [];

  for (const e of entries) {
    const matched =
      (e.tvg_id && byTvgId.get(e.tvg_id)) ||
      bySlug.get(slugify(e.name, e.tvg_id));

    if (matched) {
      seenIds.add(matched.id);
      // Update name/stream/logo only if changed (preserve manual edits to is_active).
      if (
        matched.name !== e.name ||
        matched.stream_url !== e.url ||
        matched.logo_url !== (e.tvg_logo ?? null)
      ) {
        updates.push(
          c.env.DB
            .prepare(
              'UPDATE channels SET name = ?, stream_url = ?, logo_url = ? WHERE id = ?'
            )
            .bind(e.name, e.url, e.tvg_logo ?? null, matched.id)
        );
        updated += 1;
      }
    } else {
      // New channel — generate unique slug.
      let baseSlug = slugify(e.name, e.tvg_id);
      let slug = baseSlug;
      let n = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${n++}`;
        if (n > 50) break;
      }
      usedSlugs.add(slug);

      // Resolve category from group-title (case-insensitive) or fallback.
      let catId = fallbackCatId;
      if (e.group_title) {
        const m = catBySlug.get(e.group_title.toLowerCase());
        if (m) catId = m;
      }

      // Country: from playlist default, or parse from tvg-id
      let country = playlist.default_country ?? e.country ?? null;
      if (!country && e.tvg_id) {
        const dot = e.tvg_id.lastIndexOf('.');
        if (dot > 0) country = e.tvg_id.slice(dot + 1).split('@')[0].toUpperCase();
      }

      adds.push(
        c.env.DB
          .prepare(
            `INSERT INTO channels
               (name, slug, stream_url, logo_url, category_id, is_active,
                source, is_direct, country, language, tvg_id, group_title,
                playlist_id)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            e.name,
            slug,
            e.url,
            e.tvg_logo ?? null,
            catId,
            playlist.source,
            playlist.is_direct,
            country,
            e.language ?? null,
            e.tvg_id ?? null,
            e.group_title ?? null,
            id
          )
      );
      added += 1;
    }
  }

  // Channels in BD but no longer in upstream → deactivate (do not delete).
  const removeStmts: D1PreparedStatement[] = [];
  for (const ch of existing ?? []) {
    if (!seenIds.has(ch.id) && ch.is_active === 1) {
      removeStmts.push(
        c.env.DB
          .prepare('UPDATE channels SET is_active = 0 WHERE id = ?')
          .bind(ch.id)
      );
      deactivated += 1;
    }
  }

  // Run statements in chunks of 50 (D1 batch ~100 limit, with safety margin).
  const allStmts = [...adds, ...updates, ...removeStmts];
  const CHUNK = 50;
  for (let i = 0; i < allStmts.length; i += CHUNK) {
    const slice = allStmts.slice(i, i + CHUNK);
    if (slice.length) await c.env.DB.batch(slice);
  }

  // Recount + mark synced
  await recountPlaylist(c.env, id);
  await c.env.DB
    .prepare(
      `UPDATE playlists
         SET last_synced_at = datetime('now'), last_sync_status = 'ok'
       WHERE id = ?`
    )
    .bind(id)
    .run();

  return c.json({ added, updated, deactivated, status: 'ok' });
});

// ---------- POST /:id/health-check ----------
// Probe each channel's stream_url with a HEAD request. Anything that times
// out or replies with 4xx/5xx gets is_active=0 so it stops being recommended.
// Runs in concurrent batches so a 600-channel playlist (USA) finishes in a
// reasonable time without blowing the worker wall-clock budget.
//
// HARD CAP: Cloudflare Workers limit a single request to 30s wall-clock on
// the paid plan (10s CPU on free). At 12 concurrent probes × 5s timeout per
// batch, anything beyond ~70 channels risks an incomplete check. We slice
// the queue at HEALTH_MAX_PER_CALL and surface `partial: true` so the UI
// can prompt the operator to run again. Channels with NULL last_error_at
// are probed first (never tested), then oldest error wins.
const HEALTH_CHUNK = 12;
const HEALTH_TIMEOUT_MS = 5_000;
const HEALTH_MAX_PER_CALL = 100;

playlistsRouter.post('/:id{[0-9]+}/health-check', requireApiKey, async (c) => {
  const id = Number(c.req.param('id'));
  const playlist = await c.env.DB
    .prepare('SELECT id FROM playlists WHERE id = ?')
    .bind(id)
    .first<{ id: number }>();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  // Total active count to know if we're truncating the run
  const totalActiveRow = await c.env.DB
    .prepare(
      'SELECT COUNT(*) as n FROM channels WHERE playlist_id = ? AND is_active = 1',
    )
    .bind(id)
    .first<{ n: number }>();
  const totalActive = totalActiveRow?.n ?? 0;

  const channelsRes = await c.env.DB
    .prepare(
      `SELECT id, stream_url FROM channels
         WHERE playlist_id = ? AND is_active = 1
         ORDER BY last_error_at IS NOT NULL, last_error_at ASC
         LIMIT ?`,
    )
    .bind(id, HEALTH_MAX_PER_CALL)
    .all<{ id: number; stream_url: string }>();
  const channels = channelsRes.results ?? [];
  const partial = totalActive > channels.length;

  if (channels.length === 0) {
    return c.json({ checked: 0, failed: 0, deactivated: 0, partial: false });
  }

  const failedIds: number[] = [];

  // Range header keeps the GET fallback cheap on large m3u8 manifests:
  // we only need the status line, not megabytes of segment data.
  const RANGE_HEADERS = { Range: 'bytes=0-1024' };

  const probe = async (ch: { id: number; stream_url: string }) => {
    try {
      let res: Response;
      try {
        res = await fetchWithTimeout(ch.stream_url, {
          method: 'HEAD',
          redirect: 'follow',
          timeoutMs: HEALTH_TIMEOUT_MS,
        });
        if (res.status === 405 || res.status === 501) {
          res = await fetchWithTimeout(ch.stream_url, {
            method: 'GET',
            headers: RANGE_HEADERS,
            redirect: 'follow',
            timeoutMs: HEALTH_TIMEOUT_MS,
          });
        }
      } catch {
        res = await fetchWithTimeout(ch.stream_url, {
          method: 'GET',
          headers: RANGE_HEADERS,
          redirect: 'follow',
          timeoutMs: HEALTH_TIMEOUT_MS,
        });
      }
      // 206 (Partial Content) counts as a healthy response from upstream.
      if (!res.ok && res.status !== 206) failedIds.push(ch.id);
      // Drain/abort the body so the connection can close immediately.
      try { await res.body?.cancel(); } catch { /* ignore */ }
    } catch {
      failedIds.push(ch.id);
    }
  };

  for (let i = 0; i < channels.length; i += HEALTH_CHUNK) {
    const batch = channels.slice(i, i + HEALTH_CHUNK);
    await Promise.allSettled(batch.map(probe));
  }

  let deactivated = 0;
  if (failedIds.length) {
    // D1 doesn't support array bindings — chunk in groups of 50 placeholders.
    for (let i = 0; i < failedIds.length; i += 50) {
      const slice = failedIds.slice(i, i + 50);
      const placeholders = slice.map(() => '?').join(',');
      await c.env.DB
        .prepare(
          `UPDATE channels SET is_active = 0, last_error_at = datetime('now')
           WHERE id IN (${placeholders})`,
        )
        .bind(...slice)
        .run();
      deactivated += slice.length;
    }
  }

  return c.json({
    checked: channels.length,
    failed: failedIds.length,
    deactivated,
    partial,
    remaining: partial ? totalActive - channels.length : 0,
  });
});
