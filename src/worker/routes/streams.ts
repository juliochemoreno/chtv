import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { resolveStreamUrl } from '../lib/stream';

export const streamsRouter = new Hono<{ Bindings: Env }>({ strict: false });

function encodeBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

streamsRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const channel = await c.env.DB
    .prepare('SELECT stream_url, is_direct, source FROM channels WHERE slug = ?')
    .bind(slug)
    .first<{ stream_url: string; is_direct: number; source: string }>();

  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  try {
    let m3u8: string;
    if (channel.is_direct) {
      // IPTV-org-style: stream_url IS the m3u8
      m3u8 = channel.stream_url;
    } else {
      // tvtvhd-style: scrape the HTML to find the m3u8
      m3u8 = await resolveStreamUrl(channel.stream_url);
    }
    // Short cache so hover-prefetch + click within a few seconds reuses the
    // resolved URL. For scraped sources (is_direct=0) the resolution itself
    // hits an upstream HTML page, so the cache pays off the most there.
    c.header(
      'Cache-Control',
      channel.is_direct
        ? 'public, max-age=30'
        : 'public, max-age=15, stale-while-revalidate=60',
    );
    return c.json({
      url: `/api/p/${encodeBase64Url(m3u8)}`,
      original_url: m3u8,
      channel: slug,
      source: channel.source,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed ${slug} (source=${channel.source}):`, msg);
    return c.json({ error: `Error extracting stream: ${msg}` }, 502);
  }
});
