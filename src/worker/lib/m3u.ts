// Minimal M3U parser for IPTV-org and similar playlist files.

export interface M3uEntry {
  name: string;
  url: string;
  tvg_id?: string;
  tvg_logo?: string;
  group_title?: string;
  language?: string;
  country?: string;
  duration?: number;
}

const ATTR_RE = /([a-zA-Z0-9-]+)="([^"]*)"/g;

export function parseM3u(text: string): M3uEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: M3uEntry[] = [];
  let pending: Partial<M3uEntry> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // #EXTINF:-1 tvg-id="..." tvg-logo="..." group-title="...",Channel Name
      const commaIdx = line.indexOf(',');
      const meta = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';

      const attrs: Record<string, string> = {};
      ATTR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ATTR_RE.exec(meta)) !== null) {
        attrs[m[1].toLowerCase()] = m[2];
      }

      const durationMatch = meta.match(/#EXTINF:(-?\d+(?:\.\d+)?)/);
      pending = {
        name: name || attrs['tvg-name'] || attrs['tvg-id'] || 'Unknown',
        tvg_id: attrs['tvg-id'] || undefined,
        tvg_logo: attrs['tvg-logo'] || undefined,
        group_title: attrs['group-title'] || undefined,
        language: attrs['tvg-language'] || undefined,
        country: attrs['tvg-country'] || undefined,
        duration: durationMatch ? Number(durationMatch[1]) : undefined,
      };
    } else if (!line.startsWith('#') && pending) {
      // Stream URL line
      pending.url = line;
      if (pending.url && pending.name) {
        entries.push(pending as M3uEntry);
      }
      pending = null;
    }
  }

  return entries;
}

const RESERVED = new Set(['admin', 'api', 'channel', 'channels', 'login']);

export function slugify(name: string, fallback?: string): string {
  let slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!slug || RESERVED.has(slug)) slug = (fallback || 'ch') + '-' + Math.random().toString(36).slice(2, 8);
  return slug.slice(0, 80);
}
