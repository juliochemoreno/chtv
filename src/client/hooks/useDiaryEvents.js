import { useEffect, useState } from 'react';
import { api } from '../services/api';

// Tiny module-level cache so LiveTicker, DailyEvents and Hero all share the
// same fetched diary events instead of issuing the request 3 times. Re-fetches
// every TTL_MS in the background so all subscribers stay reasonably fresh.

const TTL_MS = 5 * 60 * 1000;

let cache = null;
let cachedAt = 0;
let pending = null;
let lastError = null;
const subscribers = new Set();

function notify() {
  subscribers.forEach((cb) => cb());
}

async function fetchOnce() {
  if (pending) return pending;
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  pending = (async () => {
    try {
      const data = await api.getDiaryEvents();
      cache = data;
      cachedAt = Date.now();
      lastError = null;
      notify();
      return data;
    } catch (err) {
      lastError = err;
      notify();
      throw err;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export default function useDiaryEvents() {
  const [, force] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && force((n) => n + 1);
    subscribers.add(tick);
    fetchOnce().catch(() => {
      /* lastError already set + notified */
    });
    // Background refresh while mounted
    const intervalId = setInterval(() => {
      if (Date.now() - cachedAt >= TTL_MS) fetchOnce().catch(() => {});
    }, 60 * 1000);
    return () => {
      alive = false;
      subscribers.delete(tick);
      clearInterval(intervalId);
    };
  }, []);

  // status: 'loading' | 'ready' | 'empty' | 'error'
  let status;
  if (lastError && !cache) status = 'error';
  else if (!cache) status = 'loading';
  else status = Array.isArray(cache?.data) && cache.data.length ? 'ready' : 'empty';

  return { data: cache, status, error: lastError };
}
