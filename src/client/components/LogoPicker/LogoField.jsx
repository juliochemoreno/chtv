import { useEffect, useRef, useState } from 'react';
import { Search, ImageIcon, X, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import LogoPicker from './LogoPicker';
import styles from './LogoField.module.css';

const SUGGEST_DEBOUNCE_MS = 600;
const MIN_QUERY_LEN = 3;

export default function LogoField({
  value,
  onChange,
  channelName = '',
  disabled = false,
  label = 'URL Logo (opcional)',
  inputName = 'logo_url',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [dismissedFor, setDismissedFor] = useState('');
  const lastQueryRef = useRef('');

  // Auto-suggest: when name changes and logo_url is empty, search and offer first match
  useEffect(() => {
    const trimmed = (channelName || '').trim();
    if (!trimmed || trimmed.length < MIN_QUERY_LEN) {
      setSuggestion(null);
      return;
    }
    if (value && value.trim()) {
      // User already has a URL — don't override silently
      setSuggestion(null);
      return;
    }
    if (dismissedFor === trimmed.toLowerCase()) {
      setSuggestion(null);
      return;
    }

    setSuggestionLoading(true);
    const id = setTimeout(async () => {
      try {
        const data = await api.searchLogos(trimmed, 1);
        if (lastQueryRef.current !== trimmed) return; // stale
        setSuggestion(data.results?.[0] || null);
      } catch {
        setSuggestion(null);
      } finally {
        setSuggestionLoading(false);
      }
    }, SUGGEST_DEBOUNCE_MS);

    lastQueryRef.current = trimmed;
    return () => clearTimeout(id);
  }, [channelName, value, dismissedFor]);

  const applySuggestion = () => {
    if (suggestion?.logo) onChange(suggestion.logo);
    setSuggestion(null);
  };

  const dismissSuggestion = () => {
    setDismissedFor((channelName || '').trim().toLowerCase());
    setSuggestion(null);
  };

  const handlePickerSelect = (logoUrl) => {
    onChange(logoUrl);
  };

  return (
    <div className={styles.wrap}>
      <label className={styles.label}>{label}</label>

      <div className={styles.row}>
        <div className={styles.inputCluster}>
          {value ? (
            <span className={styles.previewBox} aria-hidden="true">
              <img
                src={value}
                alt=""
                className={styles.previewImg}
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
              />
            </span>
          ) : (
            <span className={styles.previewPlaceholder} aria-hidden="true">
              <ImageIcon size={14} strokeWidth={2} />
            </span>
          )}
          <input
            type="url"
            name={inputName}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className={styles.input}
            disabled={disabled}
            spellCheck="false"
            autoComplete="off"
          />
          {value && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => onChange('')}
              disabled={disabled}
              aria-label="Borrar logo"
              title="Borrar"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={styles.searchBtn}
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
        >
          <Search size={14} strokeWidth={2.4} />
          BUSCAR
        </button>
      </div>

      {/* Auto-suggestion banner */}
      {!value && suggestion && (
        <div className={styles.suggestion}>
          <span className={styles.suggestionIcon} aria-hidden="true">
            <Sparkles size={12} strokeWidth={2.4} />
          </span>
          <img
            src={suggestion.logo}
            alt=""
            className={styles.suggestionThumb}
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
          />
          <div className={styles.suggestionText}>
            <span className={styles.suggestionLabel}>SUGERENCIA</span>
            <span className={styles.suggestionName}>
              {suggestion.name}
              {suggestion.country && (
                <span className={styles.suggestionMeta}> · {suggestion.country}</span>
              )}
            </span>
          </div>
          <div className={styles.suggestionActions}>
            <button
              type="button"
              className={styles.suggestionApply}
              onClick={applySuggestion}
              disabled={disabled}
            >
              APLICAR
            </button>
            <button
              type="button"
              className={styles.suggestionDismiss}
              onClick={dismissSuggestion}
              aria-label="Descartar sugerencia"
              title="Descartar"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      {!value && !suggestion && suggestionLoading && (
        <div className={styles.suggestionLoading}>BUSCANDO LOGO PARA "{channelName}"…</div>
      )}

      <LogoPicker
        open={pickerOpen}
        initialQuery={channelName}
        onSelect={handlePickerSelect}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
