import { useCallback, useContext, useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { ChannelContext } from '../context/ChannelContext';
import { FavoritesContext } from '../context/FavoritesContext';
import ChannelCard from '../components/ChannelCard/ChannelCard';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import OffAirScreen from '../components/OffAirScreen/OffAirScreen';
import PagedGrid from '../components/PagedGrid/PagedGrid';
import styles from './Channels.module.css';

export default function Channels() {
  const navigate = useNavigate();
  const {
    channels,
    categories,
    currentChannel,
    setCurrentChannel,
    loading,
    error,
  } = useContext(ChannelContext);
  const { isFavorite, toggleFavorite } = useContext(FavoritesContext);

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('all'); // 'all' | category id | 'fav'
  // Defer the heavy filter work so typing in the search box never blocks the
  // input from re-rendering. React will run the filtered() useMemo with the
  // deferred value during a low-priority pass.
  const deferredQuery = useDeferredValue(query);

  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();

  const filtered = useMemo(() => {
    const q = norm(deferredQuery);
    return channels.filter((ch) => {
      if (activeCat === 'fav' && !isFavorite(ch.id)) return false;
      if (activeCat !== 'all' && activeCat !== 'fav' && ch.category_id !== activeCat) return false;
      if (q && !norm(ch.name).includes(q)) return false;
      return true;
    });
  }, [channels, deferredQuery, activeCat, isFavorite]);

  const counts = useMemo(() => {
    const live = channels.filter((c) => c.is_active).length;
    const fav = channels.filter((c) => isFavorite(c.id)).length;
    const byCat = new Map();
    for (const c of channels) {
      byCat.set(c.category_id, (byCat.get(c.category_id) || 0) + 1);
    }
    return { live, fav, byCat, total: channels.length };
  }, [channels, isFavorite]);

  const handleSelect = useCallback(
    (channel) => {
      setCurrentChannel(channel);
      navigate('/');
    },
    [setCurrentChannel, navigate],
  );

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <LoadingSpinner label="Cargando catálogo" />
      </div>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBox}>
          <span className={styles.errorPrefix}>// ERROR</span>
          <h2 className={styles.errorTitle}>NO SE PUDO CARGAR EL CATÁLOGO</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  // Empty catalog: reuse the broadcast OFF AIR screen so admin can import
  // a preset in 1 click and guests see a coherent message. Rendered without
  // a wrapper so it stays edge-to-edge (matches /).
  if (channels.length === 0) {
    return <OffAirScreen />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.stickyTop}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.kicker}>// CATÁLOGO</span>
          <h1 className={styles.title}>Canales disponibles</h1>
          <p className={styles.subtitle}>
            Todas las señales de tu deck. Filtra por categoría, idioma o origen.
          </p>
        </div>

        <div className={`${styles.statsBlock} ${counts.live > 0 ? styles.statsBlockLive : ''}`}>
          <span className={styles.statsKicker}>
            <span
              className={`${styles.statsKickerDot} ${counts.live > 0 ? styles.statsKickerDotLive : ''}`}
            />
            EN VIVO AHORA
          </span>
          <div className={styles.statsBody}>
            <span className={styles.statsValue}>
              {counts.live}
              <span className={styles.statsValueDim}> / {counts.total}</span>
            </span>
            <span className={styles.statsDesc}>canales activos</span>
          </div>
          {counts.fav > 0 && (
            <span className={styles.statsBadge} title="Tus favoritos">
              ★ {counts.fav}
            </span>
          )}
        </div>
      </header>

      <div className={styles.filters}>
          <div className={styles.searchWrap}>
            <Search size={14} strokeWidth={2.4} className={styles.searchIcon} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre…"
              className={styles.searchInput}
              spellCheck="false"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setQuery('')}
                aria-label="Borrar búsqueda"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`${styles.chip} ${activeCat === 'all' ? styles.chipOn : ''}`}
            onClick={() => setActiveCat('all')}
          >
            <span>Todos</span>
            <span className={styles.chipCount}>{counts.total}</span>
          </button>
            {counts.fav > 0 && (
              <button
                type="button"
                className={`${styles.chip} ${activeCat === 'fav' ? styles.chipOn : ''}`}
                onClick={() => setActiveCat('fav')}
              >
                <span>★ Favoritos</span>
                <span className={styles.chipCount}>{counts.fav}</span>
              </button>
            )}
            {categories.map((cat) => {
              const n = counts.byCat.get(cat.id) || 0;
              if (!n) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`${styles.chip} ${activeCat === cat.id ? styles.chipOn : ''}`}
                  onClick={() => setActiveCat(cat.id)}
                >
                  <span>{cat.name}</span>
                  <span className={styles.chipCount}>{n}</span>
                </button>
              );
            })}

          {(query || activeCat !== 'all') && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => { setQuery(''); setActiveCat('all'); }}
            >
              LIMPIAR FILTROS
            </button>
          )}
      </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyPrefix}>// SIN COINCIDENCIAS</span>
          <p>
            {query && activeCat !== 'all' ? (
              <>
                No hay canales que coincidan con <strong>"{query}"</strong>{' '}
                en el filtro seleccionado.
              </>
            ) : query ? (
              <>
                No hay canales que coincidan con <strong>"{query}"</strong>.
              </>
            ) : activeCat === 'fav' ? (
              <>Aún no tienes canales en favoritos.</>
            ) : (
              <>No hay canales en el filtro seleccionado.</>
            )}
          </p>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={() => { setQuery(''); setActiveCat('all'); }}
            style={{ marginTop: 12 }}
          >
            LIMPIAR FILTROS
          </button>
        </div>
      ) : (
        <PagedGrid
          className={styles.grid}
          items={filtered}
          pageSize={60}
          renderItem={(channel, index) => (
            <ChannelCard
              channel={channel}
              index={index}
              isSelected={currentChannel?.id === channel.id}
              onSelect={handleSelect}
              isFavorite={isFavorite(channel.id)}
              onToggleFavorite={toggleFavorite}
              variant="tile"
            />
          )}
        />
      )}
    </main>
  );
}
