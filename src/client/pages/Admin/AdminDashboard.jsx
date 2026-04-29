import { useCallback, useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wand2, AlertCircle, Search } from 'lucide-react';
import { api } from '../../services/api';
import { ChannelContext } from '../../context/ChannelContext';
import ChannelForm from './ChannelForm';
import AdminChannelCard from './AdminChannelCard';
import BulkLogoFiller from '../../components/LogoPicker/BulkLogoFiller';
import PagedGrid from '../../components/PagedGrid/PagedGrid';
import { notifyChannelsChanged } from '../../lib/channelEvents';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import useAuthGuard from './useAuthGuard';
import styles from './Admin.module.css';

export default function AdminDashboard() {
  const [apiKey] = useState(() => localStorage.getItem('apiKey'));
  // Read shared catalog data from ChannelContext instead of re-fetching it.
  // The provider already loaded channels/categories/playlists at app start,
  // and `notifyChannelsChanged()` keeps it fresh after any mutation.
  const ctx = useContext(ChannelContext) || {};
  const channels = ctx.channels ?? [];
  const categories = ctx.categories ?? [];
  const playlists = ctx.playlists ?? [];
  const refresh = ctx.refresh;
  const ctxLoading = ctx.loading ?? false;
  const ctxError = ctx.error ?? null;
  const [showForm, setShowForm] = useState(false);
  const [showBulkLogos, setShowBulkLogos] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [deletingChannel, setDeletingChannel] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeCat, setActiveCat] = useState('all'); // 'all' | id | 'live' | 'no-logo'
  const navigate = useNavigate();
  const guard = useAuthGuard();

  // Validate the API key once on mount — bounces back to the login screen
  // if it's invalid. The catalog itself comes from ChannelContext so we
  // don't pay for a duplicate /api/channels round-trip.
  useEffect(() => {
    if (!apiKey) {
      navigate('/admin');
      return;
    }
    api.validateApiKey(apiKey).catch((err) => {
      guard(err);
    });
  }, [apiKey, navigate, guard]);

  const loading = ctxLoading;
  const error = ctxError;

  // Stable lookup helpers — categories/playlists rarely change, so memoize
  // against those references so children that receive categoryName/playlistName
  // strings don't see new fns on every render.
  const categoryById = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);
  const playlistById = useMemo(() => {
    const m = new Map();
    for (const p of playlists) m.set(p.id, p.name);
    return m;
  }, [playlists]);
  const categoryName = useCallback(
    (id) => categoryById.get(id) ?? null,
    [categoryById],
  );
  const playlistName = useCallback(
    (id) => (id ? playlistById.get(id) ?? null : null),
    [playlistById],
  );

  const handleAdd = useCallback(() => {
    setSelectedChannel(null);
    setShowForm(true);
  }, []);
  const handleEdit = useCallback((ch) => {
    setSelectedChannel(ch);
    setShowForm(true);
  }, []);

  const handleToggle = useCallback(
    async (ch) => {
      try {
        await api.updateChannel(ch.id, { is_active: !ch.is_active }, apiKey);
        // Provider re-fetches via the channels-change event listener.
        notifyChannelsChanged();
      } catch (err) {
        if (guard(err)) return;
        alert('Error al actualizar');
      }
    },
    [apiKey, guard],
  );

  const requestDelete = useCallback((ch) => setDeletingChannel(ch), []);

  const confirmDelete = async () => {
    const ch = deletingChannel;
    if (!ch) return;
    setDeletingBusy(true);
    try {
      await api.deleteChannel(ch.id, apiKey);
      notifyChannelsChanged();
      setDeletingChannel(null);
    } catch (err) {
      if (guard(err)) return;
      alert('Error al eliminar');
    } finally {
      setDeletingBusy(false);
    }
  };

  const stats = useMemo(() => {
    const total = channels.length;
    const active = channels.filter((c) => c.is_active).length;
    const withLogo = channels.filter((c) => c.logo_url).length;
    const withoutLogo = total - withLogo;
    return { total, active, withLogo, withoutLogo, cats: categories.length };
  }, [channels, categories]);

  const deferredFilter = useDeferredValue(filter);
  const filtered = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    return channels.filter((ch) => {
      if (activeCat === 'live' && !ch.is_active) return false;
      if (activeCat === 'no-logo' && ch.logo_url) return false;
      if (
        typeof activeCat === 'number' && ch.category_id !== activeCat
      ) return false;
      if (q) {
        const hay = [ch.name, ch.slug, ch.country, ch.source]
          .filter(Boolean)
          .some((s) => s.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [channels, deferredFilter, activeCat]);

  if (!apiKey) return null;

  return (
    <div className={styles.dashboardWrapper}>
      <main className={styles.dashboardContainer}>
        <div className={styles.controlsBar}>
        <div className={styles.pageHeader}>
          <div className={styles.titleBlock}>
            <span className={styles.kicker}>// CANALES</span>
            <h1 className={styles.title}>Catálogo</h1>
            <p className={styles.subtitle}>
              Edita, activa o elimina canales individuales. Para cargar muchos a la vez, usa Listas.
            </p>
          </div>

          <div className={styles.headerRight}>
            <div className={`${styles.statsBlock} ${stats.active > 0 ? styles.statsBlockLive : ''}`}>
              <span className={styles.statsKicker}>
                <span
                  className={`${styles.statsKickerDot} ${stats.active > 0 ? styles.statsKickerDotLive : ''}`}
                />
                EN VIVO AHORA
              </span>
              <div className={styles.statsBody}>
                <span className={styles.statsValue}>
                  {stats.active}
                  <span className={styles.statsValueDim}> / {stats.total}</span>
                </span>
                <span className={styles.statsDesc}>canales activos</span>
              </div>
              {stats.withoutLogo > 0 && (
                <span className={styles.statsBadge} title="Sin logo">
                  {stats.withoutLogo} SIN LOGO
                </span>
              )}
            </div>

            <div className={styles.toolbarActions}>
              <button onClick={() => setShowBulkLogos(true)} className={styles.buttonSecondary}>
                <Wand2 size={12} strokeWidth={2.4} />
                Auto-logos
              </button>
              <button onClick={handleAdd} className={styles.button}>
                <Plus size={12} strokeWidth={2.6} />
                Agregar canal
              </button>
            </div>
          </div>
        </div>

        <div className={styles.filterChips}>
          <div className={styles.searchWrap}>
            <Search size={14} strokeWidth={2.4} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar nombre, slug, país, source…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={styles.input}
              spellCheck="false"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className={`${styles.chip} ${activeCat === 'all' ? styles.chipOn : ''}`}
            onClick={() => setActiveCat('all')}
          >
            <span>Todos</span>
            <span className={styles.chipCount}>{stats.total}</span>
          </button>
          <button
            type="button"
            className={`${styles.chip} ${activeCat === 'live' ? styles.chipOn : ''}`}
            onClick={() => setActiveCat('live')}
          >
            <span>En vivo</span>
            <span className={styles.chipCount}>{stats.active}</span>
          </button>
          <button
            type="button"
            className={`${styles.chip} ${activeCat === 'no-logo' ? styles.chipOn : ''}`}
            onClick={() => setActiveCat('no-logo')}
          >
            <span>Sin logo</span>
            <span className={styles.chipCount}>{stats.withoutLogo}</span>
          </button>
          {categories.map((cat) => {
            const count = channels.filter((c) => c.category_id === cat.id).length;
            if (!count) return null;
            return (
              <button
                key={cat.id}
                type="button"
                className={`${styles.chip} ${activeCat === cat.id ? styles.chipOn : ''}`}
                onClick={() => setActiveCat(cat.id)}
              >
                <span>{cat.name}</span>
                <span className={styles.chipCount}>{count}</span>
              </button>
            );
          })}
        </div>
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={14} strokeWidth={2.4} />
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loadingNote}>// CARGANDO CATÁLOGO…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyGrid}>
            <span className={styles.emptyKicker}>// SIN RESULTADOS</span>
            <p>
              {filter || activeCat !== 'all'
                ? 'No hay canales que coincidan con los filtros actuales.'
                : 'No hay canales en el catálogo. Agrega uno o importa un M3U.'}
            </p>
          </div>
        ) : (
          <PagedGrid
            className={styles.adminGrid}
            items={filtered}
            pageSize={60}
            renderItem={(ch, index) => (
              <AdminChannelCard
                channel={ch}
                index={index}
                categoryName={categoryName(ch.category_id)}
                playlistName={playlistName(ch.playlist_id)}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={requestDelete}
              />
            )}
          />
        )}
      </main>

      {showForm && (
        <ChannelForm
          channel={selectedChannel}
          apiKey={apiKey}
          onClose={() => { setShowForm(false); setSelectedChannel(null); }}
          onSuccess={() => {
            notifyChannelsChanged();
          }}
        />
      )}
      <BulkLogoFiller
        open={showBulkLogos}
        apiKey={apiKey}
        onClose={() => setShowBulkLogos(false)}
        onApplied={() => {
          notifyChannelsChanged();
        }}
      />

      <ConfirmDialog
        open={!!deletingChannel}
        kicker="// ELIMINAR CANAL"
        title={deletingChannel?.name ?? ''}
        description={
          <>
            Vas a eliminar este canal del catálogo. Si pertenecía a una lista,
            volverá a aparecer la próxima vez que la sincronices.
          </>
        }
        destructive
        loading={deletingBusy}
        confirmLabel="Eliminar canal"
        onConfirm={confirmDelete}
        onCancel={() => (deletingBusy ? undefined : setDeletingChannel(null))}
      />
    </div>
  );
}
