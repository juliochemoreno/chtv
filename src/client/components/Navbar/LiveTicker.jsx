import { useMemo } from 'react';
import useDiaryEvents from '../../hooks/useDiaryEvents';
import styles from './LiveTicker.module.css';

const MIN_DURATION_S = 240;
const SECONDS_PER_ITEM = 10;

function formatHour(raw) {
  if (!raw) return '··:··';
  return String(raw).slice(0, 5);
}

function buildItems(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const out = [];
  for (const ev of events) {
    const a = ev?.attributes || {};
    const time = formatHour(a.diary_hour);
    const desc = (a.diary_description || '').trim();
    const league = a.country?.data?.attributes?.name?.trim() || '';
    if (!desc) continue;
    out.push({
      key: `${ev.id}-${time}`,
      time,
      league,
      desc,
    });
  }
  return out;
}

export default function LiveTicker() {
  const { data, status } = useDiaryEvents();
  const items = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    const sorted = [...list].sort((a, b) =>
      (a.attributes?.diary_hour || '').localeCompare(b.attributes?.diary_hour || '')
    );
    return buildItems(sorted);
  }, [data]);

  const labelMeta = {
    loading: { text: 'CARGANDO', dotClass: styles.dotLoading },
    ready: { text: 'AGENDA', dotClass: styles.dotLive },
    empty: { text: 'SIN EVENTOS', dotClass: styles.dotIdle },
    error: { text: 'ERROR', dotClass: styles.dotError },
  }[status];

  // Static messages for non-ready states (no scroll, just text)
  const staticMessage = {
    loading: 'Sincronizando agenda del día…',
    empty: 'No hay eventos programados para hoy',
    error: 'No se pudo cargar la agenda',
  }[status];

  const repeated = status === 'ready' ? [...items, ...items] : null;
  const durationSec = repeated
    ? Math.max(MIN_DURATION_S, items.length * SECONDS_PER_ITEM)
    : 0;

  return (
    <div className={styles.tickerWrap} aria-hidden="true">
      <div className={`${styles.label} ${status === 'error' ? styles.labelError : ''}`}>
        <span className={`${styles.labelDot} ${labelMeta.dotClass}`} />
        {labelMeta.text}
      </div>
      <div className={styles.track}>
        {repeated ? (
          <div className={styles.lane} style={{ animationDuration: `${durationSec}s` }}>
            {repeated.map((it, i) => (
              <span key={`${it.key}-${i}`} className={styles.item}>
                <span className={styles.itemBullet}>●</span>
                <span className={styles.itemTime}>{it.time}</span>
                {it.league && <span className={styles.itemLeague}>{it.league}</span>}
                <span className={styles.itemDesc}>{it.desc}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className={`${styles.staticLane} ${status === 'error' ? styles.staticError : ''}`}>
            <span className={styles.staticDot} aria-hidden="true">·</span>
            {staticMessage}
          </div>
        )}
      </div>
    </div>
  );
}
