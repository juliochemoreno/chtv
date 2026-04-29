import { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  ListPlus,
  Zap,
  Stethoscope,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../services/api';
import { ChannelContext } from '../../context/ChannelContext';
import {
  IPTV_ORG_PRESETS,
  FREE_TV_PRESETS,
  FAST_PRESETS,
  SCRAPER_PRESETS,
} from '../../lib/iptvPresets';
import { notifyChannelsChanged } from '../../lib/channelEvents';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import useAuthGuard from './useAuthGuard';
import styles from './Admin.module.css';

function formatRelative(iso) {
  if (!iso) return null;
  const date = new Date(iso.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `hace ${diffD}d`;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

function statusMeta(p) {
  if (!p.last_synced_at) return { label: 'NUNCA', tone: 'idle' };
  if (p.last_sync_status === 'ok') return { label: 'OK', tone: 'ok' };
  if (p.last_sync_status?.startsWith('error')) return { label: 'ERROR', tone: 'error' };
  return { label: p.last_sync_status?.toUpperCase() ?? 'OK', tone: 'idle' };
}

export default function AdminPlaylists() {
  const [apiKey] = useState(() => localStorage.getItem('apiKey'));
  // Read playlists + categories from ChannelContext — they're already loaded
  // app-wide and stay fresh via the chtv:channels-change event bus.
  const ctx = useContext(ChannelContext) || {};
  const playlists = ctx.playlists ?? [];
  const categories = ctx.categories ?? [];
  const loading = ctx.loading ?? false;
  const ctxError = ctx.error ?? null;
  const [syncing, setSyncing] = useState({}); // id → bool
  const [checking, setChecking] = useState({}); // id → bool
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState(null);
  const [deleting, setDeleting] = useState(null); // playlist or null
  // Single pending-confirm slot for non-modal sensitive actions (sync, health).
  // Shape: { kind: 'sync'|'health', playlist }
  const [pendingAction, setPendingAction] = useState(null);
  const navigate = useNavigate();
  const guard = useAuthGuard();

  useEffect(() => {
    if (!apiKey) navigate('/admin');
  }, [apiKey, navigate]);

  const error = ctxError;

  const requestSync = (p) => setPendingAction({ kind: 'sync', playlist: p });
  const requestHealthCheck = (p) =>
    setPendingAction({ kind: 'health', playlist: p });

  // Keep the confirm dialog visible (with its loading state) until the
  // operation completes; only dismiss in finally.
  const runSync = async (p) => {
    setSyncing((s) => ({ ...s, [p.id]: true }));
    try {
      const res = await api.syncPlaylist(p.id, apiKey);
      notifyChannelsChanged();
      alert(
        `Sincronizado: +${res.added} nuevos · ${res.updated} actualizados · ${res.deactivated} desactivados`,
      );
    } catch (err) {
      if (guard(err)) return;
      alert(`Error al sincronizar: ${err.message || 'desconocido'}`);
    } finally {
      setSyncing((s) => ({ ...s, [p.id]: false }));
      setPendingAction(null);
    }
  };

  const runHealthCheck = async (p) => {
    setChecking((s) => ({ ...s, [p.id]: true }));
    try {
      const res = await api.healthCheckPlaylist(p.id, apiKey);
      notifyChannelsChanged();
      const more = res.partial && res.remaining > 0
        ? ` · ${res.remaining} pendientes (vuelve a ejecutar para continuar)`
        : '';
      alert(
        `Health check: ${res.checked} probados · ${res.failed} fallaron · ${res.deactivated} desactivados${more}.`,
      );
    } catch (err) {
      if (guard(err)) return;
      alert(`Error en health check: ${err.message || 'desconocido'}`);
    } finally {
      setChecking((s) => ({ ...s, [p.id]: false }));
      setPendingAction(null);
    }
  };

  const openPreset = (preset) => {
    const cat = preset.category_slug
      ? categories.find((c) => c.slug === preset.category_slug)
      : null;
    // Scraper presets ship a relative URL (e.g. /api/import/scrape/tvtvhd.m3u)
    // that points back at our own worker. Resolve it against window.origin so
    // both the URL validation and the worker's later sync fetch get an
    // absolute URL.
    const url = preset.url.startsWith('/')
      ? new URL(preset.url, window.location.origin).toString()
      : preset.url;
    // Use the source as the brand prefix in the playlist name (was always
    // "iptv-org · …" before). Falls back to the label if source is missing.
    const brand =
      preset.source && preset.source !== 'iptv-org'
        ? preset.source
        : 'iptv-org';
    setCreatePrefill({
      name: `${brand} · ${preset.label}`,
      url,
      source: preset.source,
      defaultCategoryId: cat ? String(cat.id) : '',
      defaultCountry: preset.country ?? '',
      isDirect: preset.is_direct,
    });
    setCreateOpen(true);
  };

  const handleDelete = async (p, cascade) => {
    try {
      await api.deletePlaylist(p.id, apiKey, { cascade });
      setDeleting(null);
      // Channels were either cascade-deleted or orphaned (their playlist_id
      // dropped to NULL) — either way the public views need a refresh.
      notifyChannelsChanged();
    } catch (err) {
      if (guard(err)) return;
      alert(`Error al eliminar: ${err.message || 'desconocido'}`);
    }
  };

  const totalChannels = useMemo(
    () => playlists.reduce((acc, p) => acc + (p.channel_count || 0), 0),
    [playlists],
  );

  if (!apiKey) return null;

  return (
    <div className={styles.dashboardWrapper}>
      <main className={styles.dashboardContainer}>
        <div className={styles.controlsBar}>
          <div className={styles.pageHeader}>
            <div className={styles.titleBlock}>
              <span className={styles.kicker}>// LISTAS</span>
              <h1 className={styles.title}>Mis listas</h1>
              <p className={styles.subtitle}>
                Importa fuentes M3U y mantenlas sincronizadas. Cada lista agrupa decenas de canales.
              </p>
            </div>

            <div className={styles.headerRight}>
              <div className={`${styles.statsBlock} ${totalChannels > 0 ? styles.statsBlockLive : ''}`}>
                <span className={styles.statsKicker}>
                  <span
                    className={`${styles.statsKickerDot} ${totalChannels > 0 ? styles.statsKickerDotLive : ''}`}
                  />
                  CANALES IMPORTADOS
                </span>
                <div className={styles.statsBody}>
                  <span className={styles.statsValue}>{totalChannels}</span>
                  <span className={styles.statsDesc}>
                    desde {playlists.length}{' '}
                    {playlists.length === 1 ? 'lista' : 'listas'}
                  </span>
                </div>
              </div>

              <div className={styles.toolbarActions}>
                <button
                  onClick={() => {
                    setCreatePrefill(null);
                    setCreateOpen(true);
                  }}
                  className={styles.button}
                >
                  <Plus size={12} strokeWidth={2.6} />
                  Nueva lista
                </button>
              </div>
            </div>
          </div>

          <div className={styles.presetRow}>
            <span
              className={`${styles.presetLabel} ${styles.presetLabelFast}`}
              title="Free-TV/IPTV — catálogo comunitario alternativo con curación más activa que iptv-org"
            >
              <Zap size={11} strokeWidth={2.6} />
              FREE-TV · CURADO
            </span>
            <div className={styles.presetChips}>
              {FREE_TV_PRESETS.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  className={`${styles.presetChip} ${styles.presetChipFast}`}
                  onClick={() => openPreset(p)}
                  title={`Importar ${p.label}`}
                >
                  <span className={styles.presetChipLabel}>{p.label}</span>
                  <span className={styles.presetChipSub}>{p.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {FAST_PRESETS.length > 0 && (
            <div className={styles.presetRow}>
              <span
                className={styles.presetLabel}
                title="FAST channels — solo cubre Nueva Zelanda y Australia. Los servicios globales (Pluto/Samsung/Plex) no publican M3U pública por ahora."
              >
                <Zap size={11} strokeWidth={2.6} />
                FAST · NZ/AU
              </span>
              <div className={styles.presetChips}>
                {FAST_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    className={styles.presetChip}
                    onClick={() => openPreset(p)}
                    title={`Importar ${p.label}`}
                  >
                    <span className={styles.presetChipLabel}>{p.label}</span>
                    <span className={styles.presetChipSub}>{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.presetRow}>
            <span
              className={styles.presetLabel}
              title="Catálogo comunitario iptv-org — gran cantidad pero calidad variable"
            >
              <Zap size={11} strokeWidth={2.6} />
              IPTV-ORG · COMUNIDAD
            </span>
            <div className={styles.presetChips}>
              {IPTV_ORG_PRESETS.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  className={styles.presetChip}
                  onClick={() => openPreset(p)}
                  title={`Importar ${p.label}`}
                >
                  <span className={styles.presetChipLabel}>{p.label}</span>
                  <span className={styles.presetChipSub}>{p.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {SCRAPER_PRESETS.length > 0 && (
            <div className={`${styles.presetRow} ${styles.presetRowScraper}`}>
              <span
                className={`${styles.presetLabel} ${styles.presetLabelScraper}`}
                title="Fuentes scraped de agregadores comunitarios. Los streams suelen ser canales premium sin licencia — úsalas bajo tu propia responsabilidad. La calidad y disponibilidad fluctúan más que las opciones legales."
              >
                <Zap size={11} strokeWidth={2.6} />
                FUENTES SCRAPED · AVANZADO
              </span>
              <div className={styles.presetChips}>
                {SCRAPER_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    className={`${styles.presetChip} ${styles.presetChipScraper}`}
                    onClick={() => openPreset(p)}
                    title={`Importar ${p.label} — fuente no oficial, scraped en cada sync`}
                  >
                    <span className={styles.presetChipLabel}>{p.label}</span>
                    <span className={styles.presetChipSub}>{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={14} strokeWidth={2.4} />
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loadingNote}>// CARGANDO LISTAS…</div>
        ) : playlists.length === 0 ? (
          <div className={styles.emptyGrid}>
            <span className={styles.emptyKicker}>// SIN LISTAS</span>
            <p>
              No tienes listas todavía. Crea una para importar canales en lote
              desde una URL .m3u y poder sincronizarla después.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className={styles.button}
              style={{ marginTop: 12 }}
            >
              <ListPlus size={12} strokeWidth={2.6} />
              Crear primera lista
            </button>
          </div>
        ) : (
          <ul className={styles.playlistGrid}>
            {playlists.map((p) => {
              const status = statusMeta(p);
              const isSyncing = !!syncing[p.id];
              const isChecking = !!checking[p.id];
              const busy = isSyncing || isChecking;
              return (
                <li key={p.id} className={styles.playlistCard}>
                  <header className={styles.plHeader}>
                    <span className={styles.plName} title={p.name}>{p.name}</span>
                    <span className={`${styles.plStatus} ${styles[`plStatus_${status.tone}`]}`}>
                      {status.tone === 'ok' && <CheckCircle2 size={10} strokeWidth={2.4} />}
                      {status.tone === 'error' && <AlertCircle size={10} strokeWidth={2.4} />}
                      {status.tone === 'idle' && <Clock size={10} strokeWidth={2.4} />}
                      {status.label}
                    </span>
                  </header>

                  <div className={styles.plMeta}>
                    <div className={styles.plMetaRow}>
                      <span className={styles.plMetaLabel}>Canales</span>
                      <span className={styles.plMetaValue}>{p.channel_count}</span>
                    </div>
                    <div className={styles.plMetaRow}>
                      <span className={styles.plMetaLabel}>Source</span>
                      <span className={styles.plMetaValue}>{p.source}</span>
                    </div>
                    {p.default_country && (
                      <div className={styles.plMetaRow}>
                        <span className={styles.plMetaLabel}>País</span>
                        <span className={styles.plMetaValue}>{p.default_country}</span>
                      </div>
                    )}
                    <div className={styles.plMetaRow}>
                      <span className={styles.plMetaLabel}>Última sync</span>
                      <span className={styles.plMetaValue}>
                        {formatRelative(p.last_synced_at) ?? '—'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.plUrl} title={p.url}>{p.url}</div>

                  <footer className={styles.plActions}>
                    <button
                      type="button"
                      className={styles.plActionPrimary}
                      onClick={() => requestSync(p)}
                      disabled={busy}
                      title="Sincronizar"
                    >
                      <RefreshCw
                        size={12}
                        strokeWidth={2.4}
                        className={isSyncing ? styles.spinIcon : ''}
                      />
                      {isSyncing ? 'Sincronizando…' : 'Sincronizar'}
                    </button>
                    <button
                      type="button"
                      className={styles.plActionIcon}
                      onClick={() => requestHealthCheck(p)}
                      disabled={busy}
                      title="Health check (probar streams)"
                      aria-label="Health check"
                    >
                      <Stethoscope
                        size={12}
                        strokeWidth={2.4}
                        className={isChecking ? styles.spinIcon : ''}
                      />
                    </button>
                    <button
                      type="button"
                      className={styles.plActionIcon}
                      onClick={() => setDeleting(p)}
                      disabled={busy}
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={12} strokeWidth={2.4} />
                    </button>
                  </footer>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {createOpen && (
        <CreatePlaylistModal
          apiKey={apiKey}
          categories={categories}
          prefill={createPrefill}
          onClose={() => {
            setCreateOpen(false);
            setCreatePrefill(null);
          }}
          onCreated={() => {
            setCreateOpen(false);
            setCreatePrefill(null);
            notifyChannelsChanged();
          }}
          guard={guard}
        />
      )}

      {deleting && (
        <DeletePlaylistModal
          playlist={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={(cascade) => handleDelete(deleting, cascade)}
        />
      )}

      <ConfirmDialog
        open={pendingAction?.kind === 'sync'}
        kicker="// SINCRONIZAR LISTA"
        title={pendingAction?.playlist?.name ?? ''}
        description={
          <>
            Vas a re-sincronizar esta lista contra su URL fuente. Se
            <strong> añadirán nuevos canales</strong>, se{' '}
            <strong>actualizarán</strong> los existentes y se
            <strong> desactivarán</strong> los que ya no aparezcan.
          </>
        }
        confirmLabel="Sincronizar"
        loading={!!(pendingAction?.kind === 'sync' && syncing[pendingAction?.playlist?.id])}
        onConfirm={() => runSync(pendingAction.playlist)}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction?.kind === 'health'}
        kicker="// HEALTH CHECK"
        title={pendingAction?.playlist?.name ?? ''}
        description={
          <>
            Se probará el estado de los{' '}
            <strong>{pendingAction?.playlist?.channel_count ?? 0}</strong>{' '}
            canales activos de esta lista. Los streams que no respondan se
            marcarán como inactivos automáticamente.
          </>
        }
        confirmLabel="Probar streams"
        loading={!!(pendingAction?.kind === 'health' && checking[pendingAction?.playlist?.id])}
        onConfirm={() => runHealthCheck(pendingAction.playlist)}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ----- Create modal -----

function CreatePlaylistModal({ apiKey, categories, prefill, onClose, onCreated, guard }) {
  const isPreset = !!prefill;
  const [name, setName] = useState(prefill?.name ?? '');
  const [url, setUrl] = useState(prefill?.url ?? '');
  const [source] = useState(prefill?.source ?? 'm3u');
  const [defaultCategoryId, setDefaultCategoryId] = useState(prefill?.defaultCategoryId ?? '');
  const [defaultCountry, setDefaultCountry] = useState(prefill?.defaultCountry ?? '');
  const [isDirect, setIsDirect] = useState(prefill?.isDirect ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState(''); // '', 'creating', 'syncing'
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('Nombre requerido');
    try {
      new URL(url);
    } catch {
      return setErr('URL inválida');
    }
    setSubmitting(true);
    setSubmitStage('creating');
    try {
      const created = await api.createPlaylist(
        {
          name: name.trim(),
          url: url.trim(),
          source,
          is_direct: isDirect,
          default_category_id: defaultCategoryId
            ? Number(defaultCategoryId)
            : null,
          default_country: defaultCountry.trim().toUpperCase() || null,
        },
        apiKey,
      );
      // Auto-sync so the new playlist isn't empty in the grid.
      try {
        setSubmitStage('syncing');
        await api.syncPlaylist(created.id, apiKey);
      } catch (syncErr) {
        if (guard(syncErr)) return;
        // Soft fail: list exists, but inform the user the first sync failed.
        // They can hit Sync manually from the grid.
        // eslint-disable-next-line no-alert
        alert(
          `Lista creada, pero la primera sincronización falló: ${syncErr.message || 'desconocido'}. Puedes reintentar desde la tarjeta.`,
        );
      }
      notifyChannelsChanged();
      onCreated();
    } catch (error) {
      if (guard(error)) return;
      setErr(error.message || 'Error al crear');
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={styles.formOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <motion.div
          className={styles.formContainer}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.formHeader}>
            <div>
              <span className={styles.formKicker}>
                {isPreset ? '// PRESET IPTV-ORG' : '// NUEVA LISTA'}
              </span>
              <h2>{isPreset ? 'Importar lista' : 'Crear playlist'}</h2>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>

          <form onSubmit={submit} style={{ display: 'contents' }}>
            <div className={styles.formBody}>
              <div className={styles.formGroup}>
                <label htmlFor="pl-name">Nombre *</label>
                <input
                  id="pl-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={styles.input}
                  disabled={submitting}
                  spellCheck="false"
                  autoComplete="off"
                  maxLength={200}
                  placeholder="Ej: México iptv-org"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="pl-url">URL del archivo M3U *</label>
                <input
                  id="pl-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={styles.input}
                  placeholder="https://iptv-org.github.io/iptv/countries/mx.m3u"
                  disabled={submitting}
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              <div className={styles.formGrid2}>
                <div className={styles.formGroup}>
                  <label htmlFor="pl-cat">Categoría por defecto</label>
                  <select
                    id="pl-cat"
                    value={defaultCategoryId}
                    onChange={(e) => setDefaultCategoryId(e.target.value)}
                    className={styles.input}
                    disabled={submitting}
                  >
                    <option value="">Sin default</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="pl-country">País (ISO 2)</label>
                  <input
                    id="pl-country"
                    type="text"
                    value={defaultCountry}
                    onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())}
                    className={styles.input}
                    placeholder="MX, AR, ES…"
                    disabled={submitting}
                    maxLength={2}
                    spellCheck="false"
                    autoComplete="off"
                  />
                </div>
              </div>

              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={isDirect}
                  onChange={(e) => setIsDirect(e.target.checked)}
                  disabled={submitting}
                />
                <span className={styles.toggleBody}>
                  <span className={styles.toggleTitle}>STREAMS DIRECTOS</span>
                  <span className={styles.toggleDesc}>
                    Las URLs en la lista son <code className={styles.inlineCode}>.m3u8</code> directos.
                    Activado para iptv-org.
                  </span>
                </span>
              </label>

              {err && (
                <div className={styles.error}>
                  <AlertCircle size={14} strokeWidth={2.4} />
                  {err}
                </div>
              )}
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={onClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button type="submit" className={styles.button} disabled={submitting}>
                <Plus size={12} strokeWidth={2.6} />
                {submitStage === 'syncing'
                  ? 'Sincronizando…'
                  : submitStage === 'creating'
                  ? 'Creando…'
                  : isPreset
                  ? 'Importar e iniciar sync'
                  : 'Crear lista'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ----- Delete modal -----

function DeletePlaylistModal({ playlist, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);

  const handle = async (cascade) => {
    setBusy(true);
    try {
      await onConfirm(cascade);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={styles.formOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={busy ? undefined : onCancel}
      >
        <motion.div
          className={styles.formContainer}
          style={{ width: 'min(440px, 100%)' }}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.formHeader}>
            <div>
              <span className={styles.formKicker}>// ELIMINAR LISTA</span>
              <h2>{playlist.name}</h2>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onCancel}
              disabled={busy}
              aria-label="Cancelar"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>

          <div className={styles.formBody}>
            <p className={styles.deleteIntro}>
              Esta lista contiene <strong>{playlist.channel_count}</strong> canales.
              ¿Qué quieres hacer con ellos?
            </p>

            <button
              type="button"
              className={styles.deleteOption}
              onClick={() => handle(false)}
              disabled={busy}
            >
              <span className={styles.deleteOptionLabel}>Solo la lista</span>
              <span className={styles.deleteOptionDesc}>
                Los {playlist.channel_count} canales quedan como <em>Manual</em>{' '}
                (huérfanos). Se preservan, sus favoritos y toggles también.
              </span>
            </button>

            <button
              type="button"
              className={`${styles.deleteOption} ${styles.deleteOptionDanger}`}
              onClick={() => handle(true)}
              disabled={busy}
            >
              <span className={styles.deleteOptionLabel}>
                Lista + {playlist.channel_count} canales
              </span>
              <span className={styles.deleteOptionDesc}>
                Borra todo en bloque. <strong>Esta acción no se puede deshacer.</strong>
              </span>
            </button>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
