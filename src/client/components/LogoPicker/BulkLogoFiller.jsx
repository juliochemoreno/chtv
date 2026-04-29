import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Loader2, Wand2, AlertCircle, CheckCheck } from 'lucide-react';
import { api } from '../../services/api';
import styles from './BulkLogoFiller.module.css';

const COUNTRY_OPTIONS = [
  { code: '', label: 'Sin preferencia' },
  { code: 'MX', label: 'México' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'AR', label: 'Argentina' },
  { code: 'BR', label: 'Brasil' },
  { code: 'ES', label: 'España' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'PE', label: 'Perú' },
  { code: 'UK', label: 'Reino Unido' },
];

const SCORE_LABELS = {
  100: 'Exacto',
  80: 'Inicio',
  70: 'Alt exacto',
  60: 'Palabra',
  50: 'Alt inicio',
  40: 'Contiene',
  30: 'Alt cont.',
  25: 'Network exacto',
  20: 'Network',
  15: 'Network cont.',
};

function scoreLabel(s) {
  const keys = Object.keys(SCORE_LABELS).map(Number).sort((a, b) => b - a);
  for (const k of keys) if (s >= k) return SCORE_LABELS[k];
  return '';
}

export default function BulkLogoFiller({ open, apiKey, onClose, onApplied }) {
  const [overwrite, setOverwrite] = useState(false);
  const [minScore, setMinScore] = useState(60);
  const [country, setCountry] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const reqIdRef = useRef(0);

  // Run dry-run when filters change (debounced lightly)
  useEffect(() => {
    if (!open) return;
    setApplyResult(null);
    setError(null);
    setLoading(true);
    const myReq = ++reqIdRef.current;
    const id = setTimeout(async () => {
      try {
        const res = await api.bulkFillLogos(
          {
            apply: false,
            overwrite,
            min_score: minScore,
            preferred_country: country || undefined,
          },
          apiKey
        );
        if (myReq !== reqIdRef.current) return;
        setData(res);
        const next = new Set(
          (res.proposals || []).filter((p) => p.match).map((p) => p.channel_id)
        );
        setSelected(next);
      } catch (err) {
        if (myReq !== reqIdRef.current) return;
        setError(err.message || 'Error al cargar propuestas');
        setData(null);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [open, overwrite, minScore, country, apiKey]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !applying) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, applying, onClose]);

  const proposals = data?.proposals || [];
  const matchedProposals = useMemo(() => proposals.filter((p) => p.match), [proposals]);
  const unmatchedProposals = useMemo(() => proposals.filter((p) => !p.match), [proposals]);
  const summary = data?.summary;

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === matchedProposals.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(matchedProposals.map((p) => p.channel_id)));
    }
  };

  const allChecked = selected.size === matchedProposals.length && matchedProposals.length > 0;
  const someChecked = selected.size > 0 && !allChecked;

  const handleApply = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.bulkFillLogos(
        {
          apply: true,
          overwrite,
          min_score: minScore,
          preferred_country: country || undefined,
          channel_ids: Array.from(selected),
        },
        apiKey
      );
      setApplyResult(res.summary);
      onApplied?.(res.summary);
    } catch (err) {
      setError(err.message || 'Error al aplicar cambios');
    } finally {
      setApplying(false);
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
          onClick={() => !applying && onClose?.()}
          role="dialog"
          aria-modal="true"
          aria-label="Auto-rellenar logos"
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
                <span className={styles.kicker}>// BULK FILL</span>
                <h2 className={styles.title}>Auto-rellenar logos faltantes</h2>
                <p className={styles.subtitle}>
                  Busca en iptv-org y propone un logo por canal. Revisa y aplica solo lo que apruebes.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                disabled={applying}
                aria-label="Cerrar"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </header>

            {/* Filters */}
            <section className={styles.filters}>
              <label className={styles.filter}>
                <span className={styles.filterLabel}>UMBRAL</span>
                <select
                  className={styles.filterInput}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  disabled={loading || applying}
                >
                  <option value={40}>Bajo (40 — substring)</option>
                  <option value={60}>Medio (60 — palabra)</option>
                  <option value={70}>Alto (70 — alt exact)</option>
                  <option value={80}>Estricto (80 — prefix)</option>
                </select>
              </label>

              <label className={styles.filter}>
                <span className={styles.filterLabel}>PAÍS PREF.</span>
                <select
                  className={styles.filterInput}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={loading || applying}
                >
                  {COUNTRY_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  disabled={loading || applying}
                />
                <span className={styles.toggleBox} aria-hidden="true" />
                <span className={styles.toggleText}>SOBRESCRIBIR EXISTENTES</span>
              </label>

              <div className={styles.summary}>
                {loading ? (
                  <span className={styles.summaryLoading}>
                    <Loader2 size={12} className={styles.spin} strokeWidth={2.4} />
                    BUSCANDO
                  </span>
                ) : summary ? (
                  <>
                    <span><b>{summary.matched}</b> match</span>
                    <span>·</span>
                    <span><b>{summary.eligible}</b> elegibles</span>
                    <span>·</span>
                    <span>{summary.total_channels} totales</span>
                  </>
                ) : null}
              </div>
            </section>

            {/* Body */}
            <div className={styles.body}>
              {error && (
                <div className={styles.error}>
                  <AlertCircle size={14} strokeWidth={2.4} />
                  <span>{error}</span>
                </div>
              )}

              {applyResult && (
                <div className={styles.applied}>
                  <CheckCheck size={16} strokeWidth={2.4} />
                  <span>
                    <b>{applyResult.applied}</b> logos aplicados.
                    Cierra este panel para ver los cambios.
                  </span>
                </div>
              )}

              {!error && matchedProposals.length > 0 && (
                <>
                  <div className={styles.tableHead}>
                    <label className={styles.headCell}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked; }}
                        onChange={toggleAll}
                        disabled={applying}
                      />
                      <span>{selected.size}/{matchedProposals.length}</span>
                    </label>
                    <span className={styles.headSpacer}>CANAL DB</span>
                    <span className={styles.headSpacer}>SUGERENCIA</span>
                    <span className={styles.headScore}>SCORE</span>
                  </div>

                  <ul className={styles.list}>
                    {matchedProposals.map((p) => {
                      const m = p.match;
                      const isSel = selected.has(p.channel_id);
                      return (
                        <li key={p.channel_id} className={`${styles.row} ${isSel ? styles.rowOn : ''}`}>
                          <label className={styles.rowCheck}>
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleOne(p.channel_id)}
                              disabled={applying}
                            />
                          </label>

                          <div className={styles.rowChannel}>
                            <span className={styles.rowChannelName}>{p.channel_name}</span>
                            {p.current_logo && (
                              <span className={styles.rowCurrent}>
                                <img
                                  src={p.current_logo}
                                  alt=""
                                  className={styles.rowCurrentImg}
                                  loading="lazy"
                                  decoding="async"
                                />
                                <span>YA TIENE LOGO — SE REEMPLAZA</span>
                              </span>
                            )}
                          </div>

                          <div className={styles.rowMatch}>
                            <span className={styles.rowMatchThumb}>
                              <img
                                src={m.logo}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
                              />
                            </span>
                            <span className={styles.rowMatchInfo}>
                              <span className={styles.rowMatchName}>{m.name}</span>
                              <span className={styles.rowMatchMeta}>
                                {m.country && <span>{m.country}</span>}
                                {m.network && <span>· {m.network}</span>}
                                <span>· {m.id}</span>
                              </span>
                            </span>
                          </div>

                          <div className={styles.rowScore}>
                            <span className={styles.scoreNum}>{m.score}</span>
                            <span className={styles.scoreLabel}>{scoreLabel(m.score)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {!error && !loading && matchedProposals.length === 0 && (
                <div className={styles.empty}>
                  No se encontraron propuestas con los filtros actuales.
                  Prueba bajar el umbral o cambiar el país.
                </div>
              )}

              {unmatchedProposals.length > 0 && (
                <details className={styles.skipped}>
                  <summary>
                    Sin sugerencia ({unmatchedProposals.length})
                  </summary>
                  <ul className={styles.skippedList}>
                    {unmatchedProposals.slice(0, 50).map((p) => (
                      <li key={p.channel_id} className={styles.skippedItem}>
                        <span>{p.channel_name}</span>
                        <span className={styles.skippedReason}>
                          {p.skip_reason === 'has_logo' && 'Ya tiene logo'}
                          {p.skip_reason === 'low_score' && 'Sin match confiable'}
                          {p.skip_reason === 'no_match' && 'Sin coincidencia'}
                        </span>
                      </li>
                    ))}
                    {unmatchedProposals.length > 50 && (
                      <li className={styles.skippedMore}>
                        … y {unmatchedProposals.length - 50} más
                      </li>
                    )}
                  </ul>
                </details>
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
                  disabled={applying}
                >
                  CERRAR
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleApply}
                  disabled={applying || loading || selected.size === 0}
                >
                  {applying ? (
                    <>
                      <Loader2 size={14} className={styles.spin} strokeWidth={2.4} />
                      APLICANDO…
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} strokeWidth={2.4} />
                      APLICAR {selected.size > 0 ? `${selected.size} ` : ''}CAMBIOS
                    </>
                  )}
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
