import { createContext, useCallback, useEffect, useState } from 'react';

export const THEMES = [
  { id: 'gold',   label: 'PRIME',   swatch: '#ffb000' },
  { id: 'red',    label: 'SIGNAL',  swatch: '#e50914' },
  { id: 'blue',   label: 'STADIUM', swatch: '#1d70ff' },
  { id: 'purple', label: 'NEON',    swatch: '#9146ff' },
];

// Hidden palettes — kept in CSS but not exposed in the picker.
// Move any of these into THEMES above to re-enable in the dropdown.
//   { id: 'lime',    label: 'SCOREBOARD', swatch: '#d4ff00' },
//   { id: 'cyan',    label: 'AIRWAVE',    swatch: '#00e5ff' },
//   { id: 'magenta', label: 'STATIC',     swatch: '#ff2bd6' },
//   { id: 'mint',    label: 'HALFTIME',   swatch: '#10b981' },
//   { id: 'silver',  label: 'ANALOG',     swatch: '#dbe2ea' },

const STORAGE_KEY = 'tv-stream:theme';
const DEFAULT_THEME = 'gold';

function readStored() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {}
  return DEFAULT_THEME;
}

export const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  themes: THEMES,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (THEMES.some((t) => t.id === next)) setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const idx = THEMES.findIndex((t) => t.id === prev);
      const next = THEMES[(idx + 1) % THEMES.length];
      return next.id;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
