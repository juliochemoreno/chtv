import { memo } from 'react';
import { Star, Play } from 'lucide-react';
import { api } from '../../services/api';
import styles from './ChannelCard.module.css';

function formatChannelNumber(n) {
  if (typeof n !== 'number') return '··';
  return String(n).padStart(2, '0');
}

function ChannelCard({
  channel,
  isSelected,
  onSelect,
  isFavorite,
  onToggleFavorite,
  variant = 'tile',
  index,
}) {
  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    onToggleFavorite?.(channel.id);
  };
  // The card knows its channel — pass it back so the parent can keep a
  // stable handler and skip the inline () => handleSelect(channel) wrapper
  // that defeats React.memo on a 600-tile grid.
  const handleSelect = () => onSelect?.(channel);
  // Warm the stream-URL cache while the user is still considering. By the
  // time they click, the resolved URL is likely already in HTTP cache.
  const handleHover = () => api.prefetchStream(channel.slug);

  const isLive = !!channel.is_active;
  const channelNumber = formatChannelNumber(typeof index === 'number' ? index + 1 : undefined);

  if (variant === 'row') {
    return (
      <div
        className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
        onClick={handleSelect}
        onMouseEnter={handleHover}
        onFocus={handleHover}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
        aria-pressed={isSelected}
      >
        <span className={styles.rowNumber}>{channelNumber}</span>
        <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotOff}`} />
        <span className={styles.rowName}>{channel.name}</span>
        {onToggleFavorite && (
          <button
            type="button"
            className={`${styles.favBtn} ${isFavorite ? styles.favOn : ''}`}
            onClick={handleFavoriteClick}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <Star size={14} strokeWidth={2.2} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.tile} ${isSelected ? styles.tileSelected : ''} ${isLive ? styles.tileLive : ''}`}
      onClick={handleSelect}
      onMouseEnter={handleHover}
      onFocus={handleHover}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
      aria-pressed={isSelected}
    >
      <div className={styles.tileTop}>
        <span className={styles.chBadge}>
          <span className={styles.chBadgeLabel}>CH</span>
          <span className={styles.chBadgeNum}>{channelNumber}</span>
        </span>

        {isLive ? (
          <span className={styles.liveTag}>
            <span className={`${styles.dot} ${styles.dotLive}`} />
            EN VIVO
          </span>
        ) : (
          <span className={styles.offTag}>FUERA</span>
        )}
      </div>

      <div className={styles.tileArt}>
        {channel.logo_url ? (
          <img
            src={channel.logo_url}
            alt={channel.name}
            className={styles.tileLogo}
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className={styles.tileLogoFallback}>{channel.name?.[0] || '·'}</span>
        )}
        <span className={styles.tilePlay} aria-hidden="true">
          <Play size={20} strokeWidth={2.4} fill="currentColor" />
        </span>
      </div>

      <div className={styles.tileBottom}>
        <span className={styles.tileName}>{channel.name}</span>
        {onToggleFavorite && (
          <button
            type="button"
            className={`${styles.favBtn} ${isFavorite ? styles.favOn : ''}`}
            onClick={handleFavoriteClick}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <Star size={14} strokeWidth={2.2} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    </div>
  );
}

// Tiles render in 600+ at a time on /channels. memo cuts re-renders to only
// the cards whose props actually change (selection, favorite toggle, etc).
export default memo(ChannelCard);
