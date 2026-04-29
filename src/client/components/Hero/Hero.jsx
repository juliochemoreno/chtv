import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { motion, useDragControls, useMotionValue } from 'motion/react';
import {
  Signal,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ArrowUp,
  X,
} from 'lucide-react';
import { Calendar } from 'lucide-react';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { ChannelContext } from '../../context/ChannelContext';
import useDiaryEvents from '../../hooks/useDiaryEvents';
import { isoToFlag } from '../../lib/iso';
import { findEventForChannel } from '../../lib/diaryMatch';
import styles from './Hero.module.css';

function formatNumber(n) {
  if (typeof n !== 'number') return '··';
  return String(n).padStart(2, '0');
}

function getQualityLabel(height) {
  if (!height || typeof height !== 'number') return null;
  if (height >= 2160) return '4K';
  if (height >= 1440) return 'QHD';
  if (height >= 1080) return 'FHD';
  if (height >= 720) return 'HD';
  return 'SD';
}

function formatBitrate(bps) {
  if (!bps || typeof bps !== 'number' || bps <= 0) return null;
  const mbps = bps / 1_000_000;
  if (mbps >= 10) return `${Math.round(mbps)} Mbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

export default function Hero({ channel, channelIndex, totalChannels, categoryName, onSkipChannel }) {
  const isLive = !!channel?.is_active;
  const chNumber = formatNumber(typeof channelIndex === 'number' ? channelIndex + 1 : undefined);
  const total = formatNumber(totalChannels);

  // Live broadcast metadata for the topbar + meta chips.
  const { playlists = [] } = useContext(ChannelContext) || {};
  const countryIso = channel?.country?.toUpperCase() || null;
  const countryFlag = countryIso ? isoToFlag(countryIso) : '';
  const language = channel?.language?.toUpperCase() || null;
  const playlist = channel?.playlist_id
    ? playlists.find((p) => p.id === channel.playlist_id)
    : null;
  const originLabel = playlist ? `↪ ${playlist.name}` : 'MANUAL';
  const streamLabel = channel?.is_direct ? 'HLS DIRECTO' : 'PROXY';

  // Cross-reference the current channel against today's agenda. Re-evaluated
  // whenever the channel changes or the diary cache refreshes (~5min cycle).
  const { data: diary } = useDiaryEvents();
  const matchedEvent = channel
    ? findEventForChannel(diary?.data, channel)
    : null;

  const playerApiRef = useRef(null);
  const playerColRef = useRef(null);
  const playerWrapRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [miniDismissed, setMiniDismissed] = useState(false);
  const [streamStats, setStreamStats] = useState(null);

  // Live stream metrics (only after the manifest parses).
  const qualityLabel = getQualityLabel(streamStats?.height);
  const bitrateLabel = formatBitrate(streamStats?.bitrate);

  // Drag-to-move for mini player (position persisted in localStorage)
  const MINI_POS_KEY = 'chtv:mini-position';
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [dragBounds, setDragBounds] = useState(null);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const handleDragEnd = useCallback(() => {
    try {
      localStorage.setItem(
        MINI_POS_KEY,
        JSON.stringify({ x: dragX.get(), y: dragY.get() }),
      );
    } catch {
      /* ignore */
    }
  }, [dragX, dragY]);

  // Track fullscreen state changes (browser may exit via Esc)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Watch when the player wrapper leaves the viewport → enable mini mode
  useEffect(() => {
    const el = playerWrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // -80px top accounts for the sticky navbar height
        setMiniMode(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // If the channel changes, the user clearly wants to watch — un-dismiss mini.
  useEffect(() => {
    setMiniDismissed(false);
  }, [channel?.slug]);

  const showMini = miniMode && !miniDismissed && !!channel;

  // Reset drag position whenever we leave mini mode and recompute bounds when entering.
  useEffect(() => {
    if (!showMini) {
      dragX.set(0);
      dragY.set(0);
      return;
    }
    const compute = () => {
      const el = playerColRef.current;
      const w = el?.offsetWidth ?? 320;
      const h = el?.offsetHeight ?? 180;
      // Mini sits at bottom-right with 20px margin. Drag deltas are relative.
      const margin = 20;
      const breath = 12;
      const bounds = {
        top: -(window.innerHeight - h - margin - breath),
        left: -(window.innerWidth - w - margin - breath),
        right: 0,
        bottom: 0,
      };
      setDragBounds(bounds);

      // Restore last saved position, clamped to current bounds (in case viewport changed).
      try {
        const raw = localStorage.getItem(MINI_POS_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          if (typeof stored.x === 'number' && typeof stored.y === 'number') {
            dragX.set(clamp(stored.x, bounds.left, bounds.right));
            dragY.set(clamp(stored.y, bounds.top, bounds.bottom));
          }
        }
      } catch {
        /* ignore */
      }
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [showMini, dragX, dragY]);

  const handleRestoreFromMini = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleDismissMini = useCallback(() => {
    playerApiRef.current?.pause();
    setMiniDismissed(true);
  }, []);

  const handleTogglePlay = useCallback(() => {
    playerApiRef.current?.toggle();
  }, []);

  const handleToggleMute = useCallback(() => {
    playerApiRef.current?.toggleMute();
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = playerColRef.current;
    if (!el) return;
    const doc = document;
    const inFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);

    if (inFs) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      exit?.call(doc);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      req?.call(el).catch((err) => console.warn('Fullscreen rejected:', err));
    }
  }, []);

  const disabled = !channel;

  return (
    <section className={styles.hero}>
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={`${styles.inner} grain`}>
        {/* — Broadcast frame: top bar — */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <span className={styles.tcSegment}>
              <span className={styles.tcLabel}>CH</span>
              <span className={styles.tcValue}>{chNumber}</span>
              <span className={styles.tcSlash}>/</span>
              <span className={styles.tcMuted}>{total}</span>
            </span>

            {qualityLabel && (
              <span
                className={styles.streamMetric}
                title={
                  streamStats?.height
                    ? `${streamStats.height}p${
                        bitrateLabel ? ` · ${bitrateLabel}` : ''
                      }`
                    : 'Calidad del stream'
                }
              >
                <span className={styles.streamMetricLabel}>{qualityLabel}</span>
                {bitrateLabel && (
                  <span className={styles.streamMetricValue}>
                    {bitrateLabel}
                  </span>
                )}
              </span>
            )}
          </div>

          <div className={styles.topbarRight}>
            {isLive ? (
              <span className={styles.onAir}>
                <span className={styles.onAirDot} />
                AL&nbsp;AIRE
              </span>
            ) : (
              <span className={styles.standby}>EN ESPERA</span>
            )}
          </div>
        </div>

        {/* — Main grid: player + info — */}
        <div className={styles.grid}>
          <div ref={playerWrapRef} className={styles.playerColWrap}>
            <motion.div
              ref={playerColRef}
              className={`${styles.playerCol} ${showMini ? styles.playerColMini : ''}`}
              drag={showMini}
              dragControls={dragControls}
              dragListener={false}
              dragMomentum={false}
              dragElastic={0.08}
              dragConstraints={dragBounds || undefined}
              onDragEnd={handleDragEnd}
              style={{ x: dragX, y: dragY }}
            >
              <div className={styles.playerHolder}>
                <VideoPlayer
                  ref={playerApiRef}
                  channel={channel}
                  onPlayingChange={setIsPlaying}
                  onMutedChange={setIsMuted}
                  onSkipChannel={onSkipChannel}
                  onStreamStats={setStreamStats}
                />
              </div>

              {/* Mini-mode header (only visible when floating in corner) */}
              {showMini && (
                <div
                  className={styles.miniHeader}
                  onPointerDown={(e) => dragControls.start(e)}
                  title="Arrastra para mover"
                >
                  <span className={styles.miniInfo}>
                    <span className={styles.miniCh}>CH·{chNumber}</span>
                    <span className={styles.miniName}>{channel?.name}</span>
                  </span>
                  <div
                    className={styles.miniActions}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={handleRestoreFromMini}
                      aria-label="Restaurar"
                      title="Restaurar"
                    >
                      <ArrowUp size={12} strokeWidth={2.6} />
                    </button>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={handleDismissMini}
                      aria-label="Cerrar mini reproductor"
                      title="Cerrar"
                    >
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
              )}

              {/* Lower-third overlay — only shown in fullscreen, where the
                  surrounding UI (sidebar, topbar, infoCol) is not visible
                  and the user needs an in-frame channel identifier. */}
              {channel && !showMini && isFullscreen && (
                <div className={styles.lowerThird}>
                  <div className={styles.lowerLeft}>
                    <span className={styles.lowerCh}>CH·{chNumber}</span>
                  </div>
                  <div className={styles.lowerCenter}>
                    <span className={styles.lowerName}>{channel.name}</span>
                    {categoryName && (
                      <span className={styles.lowerCat}>{categoryName}</span>
                    )}
                  </div>
                  <div className={styles.lowerRight}>
                    <span className={styles.lowerBars} aria-hidden="true">
                      <span /><span /><span /><span /><span />
                    </span>
                    <span className={styles.lowerSignal}>
                      <Signal size={12} strokeWidth={2.4} />
                      SIGNAL
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <motion.aside
            className={styles.infoCol}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className={styles.infoTop}>
              <span className={styles.kicker}>// AHORA AL AIRE</span>
              <h1 className={styles.title}>
                {channel?.name || 'SELECCIONA UNA SEÑAL'}
              </h1>
              <div className={styles.metaRow}>
                {categoryName && (
                  <span className={styles.metaPill}>{categoryName}</span>
                )}
                {countryIso && (
                  <span className={styles.metaPill} title={`País: ${countryIso}`}>
                    {countryFlag && (
                      <span className={styles.metaFlag} aria-hidden="true">
                        {countryFlag}
                      </span>
                    )}
                    {countryIso}
                  </span>
                )}
                {language && (
                  <span className={styles.metaPill} title={`Idioma: ${language}`}>
                    {language}
                  </span>
                )}
                {channel && (
                  <span
                    className={`${styles.metaPill} ${styles.metaPillOrigin}`}
                    title={playlist ? `Lista: ${playlist.name}` : 'Canal manual'}
                  >
                    {originLabel}
                  </span>
                )}
                {channel && (
                  <span className={styles.metaPill} title={`Stream: ${streamLabel}`}>
                    {streamLabel}
                  </span>
                )}
              </div>

              {matchedEvent && (
                <div
                  className={`${styles.nowBlock} ${
                    matchedEvent.status === 'now' ? styles.nowBlockLive : ''
                  }`}
                >
                  <span className={styles.nowKicker}>
                    <Calendar size={11} strokeWidth={2.4} />
                    {matchedEvent.status === 'now'
                      ? 'AHORA TRANSMITIENDO'
                      : 'PRÓXIMO EN ESTE CANAL'}
                  </span>
                  <div className={styles.nowBody}>
                    <span className={styles.nowTime}>{matchedEvent.time}</span>
                    <span className={styles.nowDesc} title={matchedEvent.desc}>
                      {matchedEvent.desc}
                    </span>
                  </div>
                  {matchedEvent.league && (
                    <span className={styles.nowLeague}>{matchedEvent.league}</span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.infoActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={handleTogglePlay}
                disabled={disabled}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying
                  ? <Pause size={16} strokeWidth={2.6} fill="currentColor" />
                  : <Play size={16} strokeWidth={2.6} fill="currentColor" />}
                {isPlaying ? 'Pausar' : 'Reproducir'}
              </button>
              <button
                type="button"
                className={styles.iconAction}
                onClick={handleToggleMute}
                disabled={disabled}
                aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                aria-pressed={isMuted}
              >
                {isMuted
                  ? <VolumeX size={16} strokeWidth={2.2} />
                  : <Volume2 size={16} strokeWidth={2.2} />}
              </button>
              <button
                type="button"
                className={styles.iconAction}
                onClick={handleToggleFullscreen}
                disabled={disabled}
                aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                aria-pressed={isFullscreen}
              >
                {isFullscreen
                  ? <Minimize2 size={16} strokeWidth={2.2} />
                  : <Maximize2 size={16} strokeWidth={2.2} />}
              </button>
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
