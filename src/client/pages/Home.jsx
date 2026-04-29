import { useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelContext } from '../context/ChannelContext';
import { FavoritesContext } from '../context/FavoritesContext';
import Hero from '../components/Hero/Hero';
import ChannelRail from '../components/ChannelRail/ChannelRail';
import DailyEvents from '../components/DailyEvents/DailyEvents';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import OffAirScreen from '../components/OffAirScreen/OffAirScreen';
import LazyMount from '../components/LazyMount/LazyMount';
import styles from './Home.module.css';

export default function Home() {
  const navigate = useNavigate();
  const {
    channels,
    categories,
    currentChannel,
    setCurrentChannel,
    loading,
    error,
  } = useContext(ChannelContext);
  const { favorites, toggleFavorite, isFavorite } = useContext(FavoritesContext);

  const liveChannels = useMemo(() => channels.filter((c) => c.is_active), [channels]);
  const favoriteChannels = useMemo(
    () => channels.filter((c) => favorites.includes(c.id)),
    [channels, favorites],
  );

  const channelsByCategory = useMemo(() => {
    const map = new Map();
    for (const cat of categories) {
      const list = channels.filter((c) => c.category_id === cat.id);
      if (list.length) map.set(cat.id, { category: cat, channels: list });
    }
    return map;
  }, [channels, categories]);

  const currentCategoryName = useMemo(() => {
    if (!currentChannel) return null;
    const cat = categories.find((c) => c.id === currentChannel.category_id);
    return cat?.name || null;
  }, [currentChannel, categories]);

  const currentChannelIndex = useMemo(() => {
    if (!currentChannel) return undefined;
    return channels.findIndex((c) => c.id === currentChannel.id);
  }, [currentChannel, channels]);

  const handleSelectChannel = (channel) => {
    setCurrentChannel(channel);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Move to the next active channel after the current one. Wraps around.
  // Used by the VideoPlayer error overlay's "Probar otro canal" button.
  const handleSkipChannel = () => {
    if (!liveChannels.length) return;
    if (!currentChannel) {
      setCurrentChannel(liveChannels[0]);
      return;
    }
    const idx = liveChannels.findIndex((c) => c.id === currentChannel.id);
    const next = liveChannels[(idx + 1) % liveChannels.length];
    if (next && next.id !== currentChannel.id) setCurrentChannel(next);
  };

  const handleStreamClick = (streamName) => {
    const matched = channels.find(
      (c) =>
        streamName.toLowerCase().includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(streamName.toLowerCase()),
    );
    if (matched) handleSelectChannel(matched);
  };

  const handleFullChannel = (channel) => {
    navigate(`/channel/${channel.id}`);
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <LoadingSpinner label="Inicializando señal" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorWrap}>
        <div className={styles.errorBox}>
          <span className={styles.errorPrefix}>// ERROR</span>
          <h2 className={styles.errorTitle}>NO SE PUDO CONECTAR LA SEÑAL</h2>
          <p className={styles.errorMsg}>{error}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return <OffAirScreen />;
  }

  return (
    <main className={styles.home}>
      <Hero
        channel={currentChannel}
        channelIndex={currentChannelIndex >= 0 ? currentChannelIndex : undefined}
        totalChannels={channels.length}
        categoryName={currentCategoryName}
        onSkipChannel={handleSkipChannel}
      />

      <div className={styles.body}>
        <div className={styles.rails}>
          <ChannelRail
            prefix="//"
            title="En Vivo Ahora"
            accent="amber"
            channels={liveChannels}
            currentChannel={currentChannel}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelect={handleSelectChannel}
            emptyLabel="Sin canales en vivo"
          />

          {favoriteChannels.length > 0 && (
            <LazyMount placeholderHeight={300}>
              <ChannelRail
                prefix="★"
                title="Favoritos"
                accent="lime"
                channels={favoriteChannels}
                currentChannel={currentChannel}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onSelect={handleSelectChannel}
              />
            </LazyMount>
          )}

          {Array.from(channelsByCategory.values()).map(({ category, channels: list }) => (
            <LazyMount key={category.id} placeholderHeight={300}>
              <ChannelRail
                prefix="//"
                title={category.name}
                channels={list}
                currentChannel={currentChannel}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onSelect={handleSelectChannel}
              />
            </LazyMount>
          ))}

          {channelsByCategory.size === 0 && liveChannels.length === 0 && (
            <div className={styles.empty}>Sin canales disponibles por ahora</div>
          )}

          <div className={styles.bottomNote}>
            <span className={styles.bottomNoteDot} />
            Pulsa una tarjeta para abrir su transmisión a pantalla completa
            <button
              type="button"
              className={styles.bottomNoteBtn}
              onClick={() => currentChannel && handleFullChannel(currentChannel)}
              disabled={!currentChannel}
            >
              ABRIR ACTUAL →
            </button>
          </div>
        </div>

        <aside className={styles.eventsCol}>
          <DailyEvents onStreamClick={handleStreamClick} />
        </aside>
      </div>
    </main>
  );
}
