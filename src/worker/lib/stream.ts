// Resolves the m3u8 URL by scraping the given upstream HTML page.
import { fetchWithTimeout } from './http';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
  Referer: 'https://tvtvhd.com/',
};

export async function resolveStreamUrl(upstreamUrl: string): Promise<string> {
  const res = await fetchWithTimeout(upstreamUrl, {
    headers: HEADERS,
    redirect: 'follow',
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
  const html = await res.text();

  let m = html.match(/playbackURL\s*[=:]\s*["']?([^"'<>]+\.m3u8[^"'<>]*)["']?/);
  if (m && m[1].startsWith('http')) return m[1];
  m = html.match(/<source[^>]+src=["']([^"']+\.m3u8[^"']*)["']/);
  if (m) return m[1];
  m = html.match(/data-src=["']?(https?:\/\/[^"'<>]+\.m3u8[^"'<>]*)["']?/);
  if (m) return m[1];
  m = html.match(/(https?:\/\/[^"'<>\s]+\.m3u8[^"'<>\s]*)/);
  if (m) return m[1];
  throw new Error('No stream URL found in upstream HTML');
}
