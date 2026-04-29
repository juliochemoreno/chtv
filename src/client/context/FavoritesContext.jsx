import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const FavoritesContext = createContext();

const FAVORITES_KEY = 'chtv:favorites';
const LEGACY_FAVORITES_KEY = 'bustaTv_favorites';

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);
  const isInitialized = useRef(false);

  // Load on mount. Honor a one-shot migration from the legacy key so users
  // who already had favorites stored under the previous brand keep them.
  useEffect(() => {
    try {
      let raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_FAVORITES_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(FAVORITES_KEY, legacy);
          localStorage.removeItem(LEGACY_FAVORITES_KEY);
        }
      }
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
    isInitialized.current = true;
  }, []);

  // Persist on change (skip the initial empty-state write to avoid clobbering
  // existing storage before the load effect runs).
  useEffect(() => {
    if (!isInitialized.current) return;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      /* ignore quota errors */
    }
  }, [favorites]);

  const toggleFavorite = useCallback((channelId) => {
    setFavorites((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  }, []);

  // isFavorite is stable across renders so memoized children that use it
  // as a prop don't re-render whenever the provider re-renders.
  const isFavorite = useCallback(
    (channelId) => favorites.includes(channelId),
    [favorites],
  );

  const value = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite }),
    [favorites, toggleFavorite, isFavorite],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}
