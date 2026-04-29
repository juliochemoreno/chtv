import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X, Check, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import styles from './LogoPicker.module.css';

const DEBOUNCE_MS = 300;

export default function LogoPicker({ open, initialQuery = '', onSelect, onClose }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(null);
  const inputRef = useRef(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setChosen(null);
      // Focus the input after the dialog mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialQuery]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const id = setTimeout(async () => {
      try {
        const data = await api.searchLogos(trimmed, 24);
        setResults(data.results || []);
      } catch (err) {
        setError(err.message || 'Error al buscar');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSelect = (item) => {
    setChosen(item);
  };

  const handleConfirm = () => {
    if (chosen) {
      onSelect?.(chosen.logo, chosen);
      onClose?.();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Buscador de logos"
        >
          <motion.div
            className={styles.dialog}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className={styles.header}>
              <div className={styles.titleRow}>
                <span className={styles.kicker}>// LOGO LOOKUP</span>
                <h2 className={styles.title}>Buscar Logo del Canal</h2>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Cerrar"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </header>

            {/* Search input */}
            <div className={styles.searchWrap}>
              <Search size={14} strokeWidth={2.4} className={styles.searchIcon} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ESPN, FOX SPORTS, TUDN…"
                className={styles.searchInput}
                spellCheck="false"
                autoComplete="off"
              />
              <span className={styles.searchHint}>
                {loading ? (
                  <span className={styles.hintLoading}>
                    <Loader2 size={12} className={styles.spin} strokeWidth={2.4} />
                    BUSCANDO
                  </span>
                ) : query.trim().length < 2 ? (
                  'MIN. 2 CARACTERES'
                ) : (
                  `${results.length} RESULTADOS`
                )}
              </span>
            </div>

            {/* Body */}
            <div className={styles.body}>
              {error && (
                <div className={styles.error}>
                  <span className={styles.errorPrefix}>// ERROR</span>
                  <p>{error}</p>
                </div>
              )}

              {!error && !loading && query.trim().length >= 2 && results.length === 0 && (
                <div className={styles.empty}>
                  Sin resultados para "{query}". Intenta con otro nombre.
                </div>
              )}

              {!error && query.trim().length < 2 && (
                <div className={styles.empty}>
                  Escribe el nombre del canal para buscar logos en iptv-org.
                </div>
              )}

              {results.length > 0 && (
                <ul className={styles.grid} role="listbox" aria-label="Resultados">
                  {results.map((r) => {
                    const active = chosen?.id === r.id;
                    return (
                      <li key={r.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className={`${styles.card} ${active ? styles.cardActive : ''}`}
                          onClick={() => handleSelect(r)}
                          onDoubleClick={() => {
                            handleSelect(r);
                            onSelect?.(r.logo, r);
                            onClose?.();
                          }}
                        >
                          <span className={styles.cardThumb}>
                            <img
                              src={r.logo}
                              alt={r.name}
                              loading="lazy"
                              className={styles.cardImg}
                              onError={(e) => {
                                e.currentTarget.style.opacity = '0.2';
                              }}
                            />
                          </span>
                          <span className={styles.cardMeta}>
                            <span className={styles.cardName}>{r.name}</span>
                            <span className={styles.cardSub}>
                              {r.country && <span>{r.country}</span>}
                              {r.network && <span>· {r.network}</span>}
                            </span>
                          </span>
                          {active && (
                            <span className={styles.cardCheck} aria-hidden="true">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <footer className={styles.footer}>
              <span className={styles.footerNote}>
                Datos: <span className={styles.footerSrc}>iptv-org.github.io</span>
              </span>
              <div className={styles.footerActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={onClose}
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleConfirm}
                  disabled={!chosen}
                >
                  USAR ESTE LOGO
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
