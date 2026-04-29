import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Radio, Clock, Moon, ListFilter, Search, X } from 'lucide-react';
import DailyEvents from '../components/DailyEvents/DailyEvents';
import { ChannelContext } from '../context/ChannelContext';
import useDiaryEvents from '../hooks/useDiaryEvents';
import useClock from '../hooks/useClock';
import styles from './Events.module.css';

// Match a stream name from the agenda against any channel in the catalog.
// Same fuzzy matching used by the Home's "now broadcasting" block.
function matchStreamToChannel(streamName, channels) {
  if (!streamName || !channels?.length) return null;
  const s = streamName.toLowerCase();
  return (
    channels.find(
      (c) =>
        s.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(s),
    ) || null
  );
}

function eventStartMinutes(ev) {
  const raw = ev?.attributes?.diary_hour;
  if (!raw) return null;
  const [h, m] = String(raw).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function formatCountdown(minutes) {
  if (minutes <= 0) return 'EN VIVO';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `EN ${m}M`;
  return `EN ${h}H ${String(m).padStart(2, '0')}M`;
}

const TIME_FILTERS = [
  { id: 'all', label: 'Todos', icon: ListFilter },
  { id: 'now', label: 'Ahora', icon: Radio },
  { id: 'next3h', label: 'Próximas 3h', icon: Clock },
  { id: 'night', label: 'Noche', icon: Moon },
];

export default function Events() {
  const navigate = useNavigate();
  const { channels = [], setCurrentChannel } = useContext(ChannelContext);
  const { data } = useDiaryEvents();
  const now = useClock(60_000); // re-render every minute is plenty for countdown
  const [timeFilter, setTimeFilter] = useState('all');
  const [competitionFilter, setCompetitionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Tournament list derived from events. Sorted by event count (popular first)
  // so the user sees their busiest leagues at the start of the chip rail.
  const competitions = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    const map = new Map();
    for (const ev of list) {
      const name = ev?.attributes?.country?.data?.attributes?.name || 'Otros';
      map.set(name, (map.get(name) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // Resolve the next upcoming event (or one in progress within the last 2h).
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nextEvent = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    const candidates = list
      .map((ev) => ({ ev, start: eventStartMinutes(ev) }))
      .filter(({ start }) => start !== null && start + 120 >= nowMin);
    candidates.sort((a, b) => a.start - b.start);
    return candidates[0]?.ev ?? null;
  }, [data, nowMin]);

  const nextStart = nextEvent ? eventStartMinutes(nextEvent) : null;
  const minsToNext = nextStart != null ? nextStart - nowMin : null;

  const isStreamAvailable = useMemo(() => {
    if (!channels.length) return () => false;
    return (streamName) => !!matchStreamToChannel(streamName, channels);
  }, [channels]);

  const handleStreamClick = (streamName) => {
    const matched = matchStreamToChannel(streamName, channels);
    if (matched) {
      setCurrentChannel(matched);
      navigate('/');
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.stickyTop}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.kicker}>// AGENDA DEL DÍA</span>
          <h1 className={styles.title}>Eventos en vivo</h1>
          <p className={styles.subtitle}>
            Programación deportiva del día con streams disponibles en tu catálogo.
          </p>
        </div>

        {nextEvent && (
          <div
            className={`${styles.nextBlock} ${
              minsToNext <= 0 ? styles.nextBlockLive : ''
            }`}
          >
            <span className={styles.nextKicker}>
              <Calendar size={11} strokeWidth={2.4} />
              {minsToNext <= 0 ? 'AHORA' : 'PRÓXIMO'}
            </span>
            <div className={styles.nextBody}>
              <span className={styles.nextTime}>
                {String(nextEvent.attributes.diary_hour || '').slice(0, 5)}
              </span>
              <span
                className={styles.nextDesc}
                title={nextEvent.attributes.diary_description}
              >
                {nextEvent.attributes.diary_description}
              </span>
            </div>
            <span className={styles.nextCountdown}>
              {formatCountdown(minsToNext)}
            </span>
          </div>
        )}
      </header>

      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search size={14} strokeWidth={2.4} className={styles.searchIcon} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar equipo, liga, canal…"
            className={styles.searchInput}
            spellCheck="false"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearchQuery('')}
              aria-label="Borrar búsqueda"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {TIME_FILTERS.map((f) => {
          const Icon = f.icon;
          const active = timeFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`${styles.filterChip} ${
                active ? styles.filterChipOn : ''
              }`}
              onClick={() => setTimeFilter(f.id)}
            >
              <Icon size={12} strokeWidth={2.4} />
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {competitions.length > 0 && (
        <div className={styles.tournaments}>
          <button
            type="button"
            className={`${styles.tournamentChip} ${
              competitionFilter === 'all' ? styles.tournamentChipOn : ''
            }`}
            onClick={() => setCompetitionFilter('all')}
          >
            <span>Todos los torneos</span>
          </button>
          {competitions.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`${styles.tournamentChip} ${
                competitionFilter === c.name ? styles.tournamentChipOn : ''
              }`}
              onClick={() => setCompetitionFilter(c.name)}
              title={c.name}
            >
              <span className={styles.tournamentName}>{c.name}</span>
              <span className={styles.tournamentCount}>{c.count}</span>
            </button>
          ))}
        </div>
      )}
      </div>

      <section className={styles.body}>
        <DailyEvents
          onStreamClick={handleStreamClick}
          isStreamAvailable={isStreamAvailable}
          timeFilter={timeFilter}
          competitionFilter={competitionFilter}
          searchQuery={searchQuery}
          showHeader={false}
          showSearch={false}
        />
      </section>
    </main>
  );
}
