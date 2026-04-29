import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import useDiaryEvents from '../../hooks/useDiaryEvents';
import styles from './DailyEvents.module.css';

// Each event's start time vs "now" decides whether it lands in the AHORA
// (in progress) bucket or PRÓXIMAS 3H bucket.
const IN_PROGRESS_AFTER_MIN = 120; // event still considered "live" 2h after start
const NEXT_WINDOW_MIN = 180; // next 3 hours

function eventStartMinutes(ev) {
  const raw = ev?.attributes?.diary_hour;
  if (!raw) return null;
  const [h, m] = String(raw).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function passesTimeFilter(ev, filter, currentMin) {
  if (filter === 'all') return true;
  const start = eventStartMinutes(ev);
  if (start === null) return false;
  if (filter === 'now') {
    return start <= currentMin && currentMin < start + IN_PROGRESS_AFTER_MIN;
  }
  if (filter === 'next3h') {
    return start > currentMin && start <= currentMin + NEXT_WINDOW_MIN;
  }
  if (filter === 'night') {
    return start >= 18 * 60 && start < 24 * 60;
  }
  return true;
}

export default function DailyEvents({
  onStreamClick,
  isStreamAvailable,
  timeFilter = 'all',
  competitionFilter = 'all',
  showHeader = true,
  showSearch = true,
  searchQuery: controlledSearch,
}) {
  const { data, status } = useDiaryEvents();
  const loading = status === 'loading';
  const error = status === 'error';
  // Controlled if a searchQuery prop is provided, otherwise self-managed.
  const [internalSearch, setInternalSearch] = useState('');
  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = setInternalSearch;
  const [nowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const events = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    return [...list].sort((a, b) => {
      const timeA = a.attributes?.diary_hour || '00:00:00';
      const timeB = b.attributes?.diary_hour || '00:00:00';
      return timeA.localeCompare(timeB);
    });
  }, [data]);

  const renderHeader = (rightSlot) => (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <span className={styles.titlePrefix}>//</span>
        <h2 className={styles.title}>Agenda en Vivo</h2>
        <span className={styles.titleMeta}>{rightSlot}</span>
      </div>
    </header>
  );

  if (loading) {
    return (
      <section className={styles.section} id="eventos">
        {renderHeader('CARGANDO')}
        <div className={styles.loadingMessage}>Sincronizando agenda…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.section} id="eventos">
        {renderHeader('ERROR')}
        <div className={styles.errorMessage}>Sin conexión con la agenda</div>
      </section>
    );
  }

  const filteredEvents = events.filter((event) => {
    if (!passesTimeFilter(event, timeFilter, nowMin)) return false;
    const competitionName = event.attributes.country?.data?.attributes.name || 'Otros';
    if (competitionFilter !== 'all' && competitionName !== competitionFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const eventTitle = event.attributes.diary_description || '';
    const streamNames = event.attributes.embeds?.data?.map((e) => e.attributes.embed_name).join(' ') || '';
    const searchLower = searchQuery.toLowerCase();
    return (
      competitionName.toLowerCase().includes(searchLower) ||
      eventTitle.toLowerCase().includes(searchLower) ||
      streamNames.toLowerCase().includes(searchLower)
    );
  });

  const groupedByCompetition = filteredEvents.reduce((acc, event) => {
    const competitionName = event.attributes.country?.data?.attributes.name || 'Otros';
    const competitionData = event.attributes.country?.data;
    if (!acc[competitionName]) {
      acc[competitionName] = { data: competitionData, events: [] };
    }
    acc[competitionName].events.push(event);
    return acc;
  }, {});

  const totalEvents = filteredEvents.length;

  return (
    <section className={styles.section} id="eventos">
      {showHeader && renderHeader(`${String(totalEvents).padStart(2, '0')} EVENTOS`)}

      {showSearch && (
        <div className={styles.searchWrap}>
          <Search size={14} strokeWidth={2.4} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Filtrar por equipo, liga, canal…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            spellCheck="false"
            autoComplete="off"
          />
        </div>
      )}

      {!events.length ? (
        <div className={styles.emptyMessage}>No hay eventos disponibles</div>
      ) : Object.keys(groupedByCompetition).length === 0 ? (
        <div className={styles.emptyMessage}>Sin coincidencias</div>
      ) : (
        <div className={styles.competitionsContainer}>
          {Object.entries(groupedByCompetition).map(([competitionName, { data: competitionData, events: competitionEvents }]) => (
            <div key={competitionName} className={styles.competitionGroup}>
              <div className={styles.competitionHeader}>
                {competitionData?.attributes.image?.data?.attributes?.url && (
                  <img
                    src={`https://pltvhd.com${competitionData.attributes.image.data.attributes.url}`}
                    alt={competitionName}
                    className={styles.competitionLogo}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <h3 className={styles.competitionTitle}>{competitionName}</h3>
                <span className={styles.competitionCount}>
                  {String(competitionEvents.length).padStart(2, '0')}
                </span>
              </div>
              <div className={styles.eventsList}>
                {competitionEvents.map((event) => {
                  const start = eventStartMinutes(event);
                  const isLive =
                    start !== null &&
                    start <= nowMin &&
                    nowMin < start + IN_PROGRESS_AFTER_MIN;
                  return (
                  <div
                    key={event.id}
                    className={`${styles.eventCard} ${isLive ? styles.eventCardLive : ''}`}
                  >
                    <div className={styles.eventTime}>
                      {(event.attributes.diary_hour || '00:00:00').substring(0, 5)}
                      {isLive && (
                        <span className={styles.liveBadge} aria-label="En vivo ahora">
                          <span className={styles.liveDot} />
                          EN VIVO
                        </span>
                      )}
                    </div>
                    <div className={styles.eventBody}>
                      <h4 className={styles.eventTitle}>
                        {event.attributes.diary_description}
                      </h4>
                      {event.attributes.embeds?.data && event.attributes.embeds.data.length > 0 && (
                        <div className={styles.streamsList}>
                          {event.attributes.embeds.data.map((embed) => {
                            const name = embed.attributes.embed_name;
                            // If no predicate is provided, treat all as available
                            // (preserves prior behavior for callers that don't pass it).
                            const available = isStreamAvailable
                              ? isStreamAvailable(name)
                              : true;
                            return (
                              <button
                                key={embed.id}
                                type="button"
                                className={`${styles.streamBadge} ${
                                  available
                                    ? styles.streamBadgeAvail
                                    : styles.streamBadgeUnavail
                                }`}
                                onClick={
                                  available && onStreamClick
                                    ? () => onStreamClick(name)
                                    : undefined
                                }
                                disabled={!available}
                                title={
                                  available
                                    ? `Reproducir ${name}`
                                    : `${name} no está en tu catálogo`
                                }
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
