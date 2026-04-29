import { memo } from 'react';
import { Power, PowerOff, Pencil, Trash2 } from 'lucide-react';
import styles from './AdminChannelCard.module.css';

function formatChannelNumber(n) {
  if (typeof n !== 'number') return '··';
  return String(n).padStart(2, '0');
}

function AdminChannelCard({
  channel,
  index,
  categoryName,
  playlistName,
  onToggle,
  onEdit,
  onDelete,
}) {
  const isLive = !!channel.is_active;
  const channelNumber = formatChannelNumber(typeof index === 'number' ? index + 1 : undefined);

  // Pass the channel back to the parent so the parent can use a single
  // stable handler regardless of how many cards render. Avoids inline
  // arrow wrappers that would defeat React.memo on every keystroke.
  const handleEdit = () => onEdit?.(channel);
  const handleToggle = (e) => { e.stopPropagation(); onToggle?.(channel); };
  const handleDelete = (e) => { e.stopPropagation(); onDelete?.(channel); };

  return (
    <div
      className={`${styles.card} ${isLive ? styles.cardLive : ''}`}
      onClick={handleEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleEdit();
      }}
      aria-label={`Editar ${channel.name}`}
    >
      <div className={styles.top}>
        <span className={styles.chBadge}>
          <span className={styles.chBadgeLabel}>CH</span>
          <span className={styles.chBadgeNum}>{channelNumber}</span>
        </span>
        {isLive ? (
          <span className={styles.liveTag}>
            <span className={styles.dot} />
            EN VIVO
          </span>
        ) : (
          <span className={styles.offTag}>FUERA</span>
        )}
      </div>

      <div className={styles.art}>
        {channel.logo_url ? (
          <img
            src={channel.logo_url}
            alt={channel.name}
            className={styles.logo}
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
          />
        ) : (
          <span className={styles.logoFallback}>{channel.name?.[0] || '·'}</span>
        )}

        {/* Action overlay (visible on hover) */}
        <div className={styles.overlay}>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.overlayBtnToggle}`}
            onClick={handleToggle}
            aria-label={isLive ? 'Desactivar canal' : 'Activar canal'}
            title={isLive ? 'Desactivar' : 'Activar'}
          >
            {isLive
              ? <PowerOff size={14} strokeWidth={2.4} />
              : <Power size={14} strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.overlayBtnEdit}`}
            onClick={(e) => { e.stopPropagation(); handleEdit(); }}
            aria-label="Editar canal"
            title="Editar"
          >
            <Pencil size={14} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.overlayBtnDelete}`}
            onClick={handleDelete}
            aria-label="Eliminar canal"
            title="Eliminar"
          >
            <Trash2 size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className={styles.bottom}>
        <span className={styles.name}>{channel.name}</span>
        <span className={styles.meta}>
          <span className={styles.metaSlug}>{channel.slug}</span>
          {categoryName && (
            <>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaCat}>{categoryName}</span>
            </>
          )}
        </span>
        <span
          className={`${styles.origin} ${playlistName ? styles.originList : styles.originManual}`}
          title={playlistName ? `Lista: ${playlistName}` : 'Canal manual'}
        >
          {playlistName ? `↪ ${playlistName}` : 'Manual'}
        </span>
      </div>
    </div>
  );
}

// Same reason as ChannelCard: 600+ instances render at once on /admin/dashboard.
export default memo(AdminChannelCard);
