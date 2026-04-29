import { useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ListPlus, LogIn, RefreshCw, AlertCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ChannelContext } from '../../context/ChannelContext';
import useAdminSession from '../../hooks/useAdminSession';
import { getQuickPresets } from '../../lib/iptvPresets';
import { notifyChannelsChanged } from '../../lib/channelEvents';
import { api } from '../../services/api';
import styles from './OffAirScreen.module.css';

// Shown on Home when there are no channels in the database yet.
// Two states: admin (1-click preset import) vs guest (passive notice).
export default function OffAirScreen() {
  const isAdmin = useAdminSession();
  const { setCurrentChannel, refresh } = useContext(ChannelContext);
  const [busy, setBusy] = useState(null); // preset URL while importing
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(null); // preset awaiting confirmation
  // Re-shuffled per mount: Colombia pinned + 2 random others.
  const quickPresets = useMemo(() => getQuickPresets(), []);

  const handleImport = async (preset) => {
    const apiKey =
      typeof window !== 'undefined' ? window.localStorage.getItem('apiKey') : null;
    if (!apiKey) {
      setErr('Sesión expirada. Inicia sesión de nuevo.');
      return;
    }
    setErr('');
    setBusy(preset.url);
    try {
      // 1. Resolve default category if the preset declares one.
      let defaultCategoryId = null;
      if (preset.category_slug) {
        const cats = await api.getCategories();
        const cat = cats.find((c) => c.slug === preset.category_slug);
        if (cat) defaultCategoryId = cat.id;
      }
      // 2. Create the playlist record.
      const created = await api.createPlaylist(
        {
          name: `iptv-org · ${preset.label}`,
          url: preset.url,
          source: preset.source,
          is_direct: preset.is_direct,
          default_category_id: defaultCategoryId,
          default_country: preset.country ?? null,
        },
        apiKey,
      );
      // 3. Sync to actually populate the channels.
      await api.syncPlaylist(created.id, apiKey);
      // 4. Refresh the channel context and auto-tune the first active channel.
      const fresh = await refresh();
      const tunable = fresh.find((c) => c.is_active) ?? fresh[0];
      if (tunable) setCurrentChannel(tunable);
      // Notify other tabs / mounted views that channels changed.
      notifyChannelsChanged();
    } catch (e) {
      setErr(e?.message || 'Error al importar la lista');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.bars} aria-hidden="true">
        <span style={{ background: '#c0c0c0' }} />
        <span style={{ background: '#c0c000' }} />
        <span style={{ background: '#00c0c0' }} />
        <span style={{ background: '#00c000' }} />
        <span style={{ background: '#c000c0' }} />
        <span style={{ background: '#c00000' }} />
        <span style={{ background: '#0000c0' }} />
      </div>

      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <span className={styles.kicker}>// FUERA DE AIRE</span>
        <h1 className={styles.title}>SIN SEÑAL</h1>
        <p className={styles.lead}>
          {isAdmin
            ? 'La parrilla está vacía. Importa una lista para sintonizar tu primera señal.'
            : 'La parrilla está vacía. El administrador todavía no ha cargado ninguna lista.'}
        </p>

        {err && (
          <div className={styles.error}>
            <AlertCircle size={14} strokeWidth={2.4} />
            {err}
          </div>
        )}

        {isAdmin ? (
          <div className={styles.adminBlock}>
            <span className={styles.blockLabel}>
              <Zap size={11} strokeWidth={2.6} />
              IMPORTAR EN UN CLICK
            </span>
            <div className={styles.presetRow}>
              {quickPresets.map((preset) => {
                const isBusy = busy === preset.url;
                const disabled = busy !== null;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    className={styles.preset}
                    onClick={() => setPending(preset)}
                    disabled={disabled}
                  >
                    <span className={styles.presetLabel}>
                      {isBusy ? (
                        <RefreshCw
                          size={12}
                          strokeWidth={2.4}
                          className={styles.spin}
                        />
                      ) : null}
                      {preset.label}
                    </span>
                    <span className={styles.presetSub}>
                      {isBusy ? 'Importando…' : preset.sub}
                    </span>
                  </button>
                );
              })}
            </div>
            <Link to="/admin/playlists" className={styles.linkSecondary}>
              <ListPlus size={12} strokeWidth={2.4} />
              Ver todos los presets y opciones avanzadas →
            </Link>
          </div>
        ) : (
          <div className={styles.guestBlock}>
            <Link to="/admin" className={styles.linkSecondary}>
              <LogIn size={12} strokeWidth={2.4} />
              ¿Eres admin? Inicia sesión →
            </Link>
          </div>
        )}
      </div>

      <div className={styles.timecode} aria-hidden="true">
        <span className={styles.timecodeDot} />
        EN ESPERA · CHTV
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={busy ? undefined : () => setPending(null)}
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className={styles.dialogHeader}>
                <div>
                  <span className={styles.dialogKicker}>// CONFIRMAR IMPORTACIÓN</span>
                  <h2 className={styles.dialogTitle}>{pending.label}</h2>
                </div>
                <button
                  type="button"
                  className={styles.dialogClose}
                  onClick={() => setPending(null)}
                  disabled={!!busy}
                  aria-label="Cancelar"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>

              <div className={styles.dialogBody}>
                <p className={styles.dialogLead}>
                  Vas a importar la lista <strong>{pending.label}</strong> ({pending.sub})
                  desde <code className={styles.dialogCode}>iptv-org</code>. La operación
                  crea una playlist y sincroniza sus canales en un solo paso.
                </p>
                <div className={styles.dialogMeta}>
                  <span className={styles.dialogMetaLabel}>URL</span>
                  <span className={styles.dialogMetaValue} title={pending.url}>
                    {pending.url}
                  </span>
                </div>
              </div>

              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.dialogCancel}
                  onClick={() => setPending(null)}
                  disabled={!!busy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.dialogConfirm}
                  onClick={async () => {
                    const target = pending;
                    await handleImport(target);
                    setPending(null);
                  }}
                  disabled={!!busy}
                >
                  {busy === pending.url ? (
                    <>
                      <RefreshCw size={12} strokeWidth={2.4} className={styles.spin} />
                      Importando…
                    </>
                  ) : (
                    <>
                      <Zap size={12} strokeWidth={2.6} />
                      Importar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
