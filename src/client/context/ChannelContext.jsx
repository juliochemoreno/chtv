import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { CHANNELS_CHANGED_EVENT } from '../lib/channelEvents';

export const ChannelContext = createContext();

const STORAGE_KEY = 'tv-stream:last-channel';
const URL_PARAM = 'ch';

function readStoredSlug() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSlug(slug) {
  if (typeof window === 'undefined') return;
  try {
    if (slug) window.localStorage.setItem(STORAGE_KEY, slug);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function ChannelProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [currentChannel, setCurrentChannelState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initializedRef = useRef(false);
  // Tracks the slug we (the app) most recently wrote into the URL so the
  // URL→state effect can ignore the echo and avoid a sync loop.
  const lastSyncedSlugRef = useRef(null);

  // Re-fetch channels + categories + playlists. Returns the fresh channels
  // list so callers (like OffAirScreen after importing a preset) can
  // auto-tune one immediately.
  //
  // `force=true` bypasses the browser HTTP cache — used after admin mutations
  // (chtv:channels-change) so the browser doesn't serve a stale Cache-Control
  // response. The initial load doesn't need it: the cache is empty anyway.
  const refresh = useCallback(async (force = false) => {
    const init = force ? { cache: 'reload' } : undefined;
    const [channelsData, categoriesData, playlistsData] = await Promise.all([
      api.getChannels(init),
      api.getCategories(init),
      // Playlists are public — failure shouldn't break channel/category load.
      api.getPlaylists(init).catch(() => []),
    ]);
    setChannels(channelsData);
    setCategories(categoriesData);
    setPlaylists(playlistsData);
    setError(null);
    return channelsData;
  }, []);

  // Initial load — channels + categories
  useEffect(() => {
    refresh()
      .catch((err) => {
        console.error('Error fetching data:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  // Listen for cross-component mutations from admin pages and refetch.
  // Force-bypass the browser cache because the public endpoints set a short
  // Cache-Control max-age and we need the just-mutated state immediately.
  useEffect(() => {
    const onChange = () => {
      refresh(true).catch((err) => {
        console.error('Error refreshing channels:', err);
      });
    };
    window.addEventListener(CHANNELS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANNELS_CHANGED_EVENT, onChange);
  }, [refresh]);

  // If the channel currently selected gets removed (or deactivated by an
  // admin mutation), drop the selection so the Home shows OffAirScreen
  // instead of trying to play a channel that no longer exists.
  useEffect(() => {
    if (!currentChannel) return;
    const stillExists = channels.some((c) => c.id === currentChannel.id);
    if (!stillExists) {
      setCurrentChannelState(null);
      writeStoredSlug(null);
      lastSyncedSlugRef.current = null;
    }
  }, [channels, currentChannel]);

  // Resolve initial channel — runs once when channels arrive.
  // Priority: URL ?ch= → localStorage → first active → first.
  useEffect(() => {
    if (initializedRef.current) return;
    if (!channels.length) return;

    const urlSlug = searchParams.get(URL_PARAM);
    const storedSlug = readStoredSlug();

    const chosen =
      (urlSlug && channels.find((c) => c.slug === urlSlug)) ||
      (storedSlug && channels.find((c) => c.slug === storedSlug)) ||
      channels.find((c) => c.is_active) ||
      channels[0] ||
      null;

    if (chosen) {
      setCurrentChannelState(chosen);
      writeStoredSlug(chosen.slug);
      lastSyncedSlugRef.current = chosen.slug;
      if (urlSlug !== chosen.slug && location.pathname === '/') {
        const next = new URLSearchParams(searchParams);
        next.set(URL_PARAM, chosen.slug);
        setSearchParams(next, { replace: true });
      }
    }

    initializedRef.current = true;
    // Intentionally only depend on `channels` — we don't want to re-bootstrap on
    // every URL change; the URL→state effect below handles those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  // URL → state. Reacts only to external URL changes (Back/Forward, paste link).
  // Uses lastSyncedSlugRef to ignore echoes of our own writes.
  useEffect(() => {
    if (!initializedRef.current) return;
    const urlSlug = searchParams.get(URL_PARAM);
    if (!urlSlug) return;
    if (lastSyncedSlugRef.current === urlSlug) return;
    if (currentChannel?.slug === urlSlug) return;
    const found = channels.find((c) => c.slug === urlSlug);
    if (found) {
      lastSyncedSlugRef.current = found.slug;
      setCurrentChannelState(found);
      writeStoredSlug(found.slug);
    }
  }, [searchParams, channels, currentChannel?.slug]);

  // State → URL. Only writes the slug when on the home route. Records the
  // slug in lastSyncedSlugRef so the URL→state effect ignores the echo.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (location.pathname !== '/') return;
    if (!currentChannel?.slug) return;
    const params = new URLSearchParams(location.search);
    if (params.get(URL_PARAM) === currentChannel.slug) return;
    lastSyncedSlugRef.current = currentChannel.slug;
    params.set(URL_PARAM, currentChannel.slug);
    setSearchParams(params, { replace: true });
  }, [currentChannel?.slug, location.pathname, location.search, setSearchParams]);

  // Stable setter — updates state + localStorage. URL sync is the effect above.
  const setCurrentChannel = useCallback((next) => {
    if (!next) {
      setCurrentChannelState(null);
      writeStoredSlug(null);
      return;
    }
    setCurrentChannelState(next);
    if (next.slug) writeStoredSlug(next.slug);
  }, []);

  // Memoize the context value so consumers don't re-render when the provider
  // re-renders for unrelated reasons.
  const value = useMemo(
    () => ({
      channels,
      categories,
      playlists,
      currentChannel,
      setCurrentChannel,
      loading,
      error,
      refresh,
    }),
    [channels, categories, playlists, currentChannel, setCurrentChannel, loading, error, refresh],
  );

  return (
    <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>
  );
}
