const BASE_URL = '';

async function handle(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data?.error || data?.detail || msg;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// Catalog reads accept an optional `init` (RequestInit subset) so callers can
// pass `{ cache: 'reload' }` to bypass HTTP cache after a mutation.
export const api = {
  getChannels: (init) =>
    fetch(`${BASE_URL}/api/channels/`, init).then(handle),
  getChannel: (id) => fetch(`${BASE_URL}/api/channels/${id}`).then(handle),
  getCategories: (init) =>
    fetch(`${BASE_URL}/api/categories/`, init).then(handle),
  validateApiKey: async (apiKey) => {
    const res = await fetch(`${BASE_URL}/api/channels/`, { headers: { 'X-API-Key': apiKey } });
    if (res.status === 401) {
      const err = new Error('API Key inválida');
      err.status = 401;
      throw err;
    }
    return handle(res);
  },
  createChannel: (data, apiKey) =>
    fetch(`${BASE_URL}/api/channels/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(data),
    }).then(handle),
  updateChannel: (id, data, apiKey) =>
    fetch(`${BASE_URL}/api/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(data),
    }).then(handle),
  deleteChannel: (id, apiKey) =>
    fetch(`${BASE_URL}/api/channels/${id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': apiKey },
    }).then(handle),
  getDiaryEvents: () => fetch('https://pltvhd.com/diaries.json').then(handle),
  searchLogos: (query, limit = 24) => {
    const q = encodeURIComponent(query.trim());
    if (!q) return Promise.resolve({ results: [] });
    return fetch(`${BASE_URL}/api/logos/search?q=${q}&limit=${limit}`).then(handle);
  },
  bulkFillLogos: (payload, apiKey) =>
    fetch(`${BASE_URL}/api/logos/bulk-fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(payload || {}),
    }).then(handle),

  // ----- Playlists (hybrid model) -----
  getPlaylists: (init) =>
    fetch(`${BASE_URL}/api/playlists`, init).then(handle),
  getPlaylist: (id) => fetch(`${BASE_URL}/api/playlists/${id}`).then(handle),
  createPlaylist: (data, apiKey) =>
    fetch(`${BASE_URL}/api/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(data),
    }).then(handle),
  updatePlaylist: (id, data, apiKey) =>
    fetch(`${BASE_URL}/api/playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(data),
    }).then(handle),
  deletePlaylist: (id, apiKey, { cascade = false } = {}) =>
    fetch(
      `${BASE_URL}/api/playlists/${id}${cascade ? '?cascade=channels' : ''}`,
      { method: 'DELETE', headers: { 'X-API-Key': apiKey } },
    ).then(handle),
  syncPlaylist: (id, apiKey) =>
    fetch(`${BASE_URL}/api/playlists/${id}/sync`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
    }).then(handle),
  healthCheckPlaylist: (id, apiKey) =>
    fetch(`${BASE_URL}/api/playlists/${id}/health-check`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
    }).then(handle),
  reportChannelError: (channelId) =>
    // Best-effort signal to the backend that a stream failed in the player.
    // No auth required — counted server-side, auto-deactivates after N hits.
    // We don't await success in callers; failures are silent.
    fetch(`${BASE_URL}/api/channels/${channelId}/report-error`, {
      method: 'POST',
    }).then(handle).catch(() => null),

  // Hover-warm: kick off the stream-URL resolution on hover so when the user
  // clicks the card the worker response is already in HTTP cache. Idempotent
  // and silent — only run once per slug per session.
  prefetchStream: (slug) => {
    if (!slug) return;
    if (typeof window === 'undefined') return;
    const cache = (window.__chtv_stream_prefetch ||= new Set());
    if (cache.has(slug)) return;
    cache.add(slug);
    fetch(`${BASE_URL}/api/streams/${slug}`, {
      // `low` priority hint asks the browser to enqueue this behind any
      // higher-priority requests (e.g. a click that wants the same URL).
      priority: 'low',
    }).catch(() => cache.delete(slug));
  },
  linkChannelToIptvOrg: (channelId, iptvOrgId, apiKey) =>
    fetch(`${BASE_URL}/api/channels/${channelId}/iptv-org-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ iptv_org_id: iptvOrgId }),
    }).then(handle),
};
