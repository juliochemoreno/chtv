import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { fetchWithTimeout } from '../lib/http';

export const proxyRouter = new Hono<{ Bindings: Env }>({ strict: false });

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
  Referer: 'https://tvtvhd.com/',
};

function encodeUrl(url: string): string {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeUrl(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

proxyRouter.get('/:encoded{.+}', async (c) => {
  const encoded = c.req.param('encoded');
  let target: string;
  try {
    target = decodeUrl(encoded);
    new URL(target);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(target, {
      headers: HEADERS,
      redirect: 'follow',
      timeoutMs: 15_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upstream error';
    return c.json({ error: `Proxy upstream failed: ${msg}` }, 502);
  }

  const ct = upstream.headers.get('content-type') ?? '';
  const isManifest =
    ct.includes('mpegurl') ||
    ct.includes('octet-stream') ||
    target.toLowerCase().includes('.m3u8');

  if (isManifest) {
    const text = await upstream.text();
    const baseUrl = new URL(upstream.url || target);

    const rewritten = text
      .split('\n')
      .map((line) => {
        if (line.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            try {
              const abs = new URL(uri, baseUrl).toString();
              return `URI="/api/p/${encodeUrl(abs)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        const trimmed = line.trim();
        if (!trimmed) return line;
        try {
          const abs = new URL(trimmed, baseUrl).toString();
          return `/api/p/${encodeUrl(abs)}`;
        } catch {
          return line;
        }
      })
      .join('\n');

    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }

  const respHeaders = new Headers();
  const passthrough = ['content-type', 'content-length', 'cache-control'];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  respHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
});

export { encodeUrl };
