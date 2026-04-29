import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RefreshCw, SkipForward, AlertTriangle } from 'lucide-react';
import CastButton from '../CastButton/CastButton';
import { api } from '../../services/api';
import { notifyChannelsChanged } from '../../lib/channelEvents';
import styles from './VideoPlayer.module.css';

const BASE_URL = '';

function VideoPlayer(
  { channel, onPlayingChange, onMutedChange, onSkipChannel, onStreamStats, controls = true },
  ref,
) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [loading, setLoading] = useState(false);
  // Phase shown to the user while the stream is coming up:
  // 'connecting' = resolving stream URL via the worker
  // 'manifest'   = downloading the m3u8 from the upstream CDN
  // 'buffering'  = manifest parsed, pre-rolling segments before play
  const [loadingPhase, setLoadingPhase] = useState('connecting');
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Always-fresh callbacks. The stream-loading effect is keyed only by
  // channel.slug + retryNonce (so it doesn't tear down hls.js on every
  // parent re-render), but it needs to call the latest props — read them
  // through this ref instead of capturing them in the closure.
  const cbRef = useRef({ onStreamStats, onSkipChannel });
  useEffect(() => {
    cbRef.current = { onStreamStats, onSkipChannel };
  }, [onStreamStats, onSkipChannel]);

  // Imperative API exposed to parent (Hero, etc.)
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play().catch(() => {}),
    pause: () => videoRef.current?.pause(),
    toggle: () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    },
    toggleMute: () => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = !v.muted;
    },
    setMuted: (next) => {
      if (videoRef.current) videoRef.current.muted = !!next;
    },
    isPaused: () => videoRef.current?.paused ?? true,
    isMuted: () => videoRef.current?.muted ?? false,
    getElement: () => videoRef.current,
  }), []);

  // Wire video events → callbacks for parent state sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const emitPlay = () => onPlayingChange?.(true);
    const emitPause = () => onPlayingChange?.(false);
    const emitVolume = () => onMutedChange?.(v.muted);
    v.addEventListener('play', emitPlay);
    v.addEventListener('playing', emitPlay);
    v.addEventListener('pause', emitPause);
    v.addEventListener('ended', emitPause);
    v.addEventListener('volumechange', emitVolume);
    // Emit initial
    emitVolume();
    onPlayingChange?.(!v.paused);
    return () => {
      v.removeEventListener('play', emitPlay);
      v.removeEventListener('playing', emitPlay);
      v.removeEventListener('pause', emitPause);
      v.removeEventListener('ended', emitPause);
      v.removeEventListener('volumechange', emitVolume);
    };
  }, [onPlayingChange, onMutedChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const cleanup = () => {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (e) { /* ignore */ }
        hlsRef.current = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e) { /* ignore */ }
      // Tell the parent the stream is gone so it doesn't display stale
      // quality/bitrate metrics after unmount or channel change.
      cbRef.current.onStreamStats?.(null);
    };

    if (!channel?.slug) {
      cleanup();
      setStreamUrl(null);
      setError(null);
      cbRef.current.onStreamStats?.(null);
      return;
    }

    cleanup();
    setLoading(true);
    setLoadingPhase('connecting');
    setError(null);
    // Drop stale stats from the previous channel until the new manifest parses.
    cbRef.current.onStreamStats?.(null);

    const run = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/streams/${channel.slug}`);
        if (!res.ok) {
          const err = new Error('No se pudo resolver el stream');
          err.shouldReport = true;
          throw err;
        }
        const data = await res.json();
        const url = data.url;
        setStreamUrl(url);

        const Hls = window.Hls;

        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // Low-latency: reduce pre-roll buffer and live-edge sync count so
            // playback starts ~1-2s sooner. If the upstream is unstable we
            // may rebuffer; the lowered manifest timeouts keep the failure
            // mode fast (auto-deactivation kicks in sooner).
            lowLatencyMode: true,
            backBufferLength: 30,
            maxBufferLength: 20,
            liveSyncDurationCount: 3,
            // Fewer retries before surfacing the error — the retry overhead
            // at the default (6) added up to >30s on dead streams.
            manifestLoadingTimeOut: 6000,
            manifestLoadingMaxRetry: 2,
            levelLoadingTimeOut: 6000,
            levelLoadingMaxRetry: 2,
            fragLoadingTimeOut: 8000,
            fragLoadingMaxRetry: 3,
          });
          // Phase: now downloading the manifest from upstream.
          setLoadingPhase('manifest');
          hls.loadSource(url);
          hls.attachMedia(video);
          // Emit current quality/bitrate so the parent (Hero topbar) can show
          // real stream metrics. Re-emit on level switches (ABR adapts).
          const emitStats = (level) => {
            const fn = cbRef.current.onStreamStats;
            if (!fn) return;
            const lv = level ?? hls.levels?.[hls.currentLevel];
            if (!lv) return;
            fn({
              width: lv.width || null,
              height: lv.height || null,
              bitrate: lv.bitrate || null,
              levelName: lv.name || (lv.height ? `${lv.height}p` : null),
            });
          };
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Manifest is ready, hls.js is now downloading the first segment.
            setLoadingPhase('buffering');
            video.play().catch((e) => console.warn('autoplay blocked:', e));
            emitStats();
          });
          // First fragment loaded → hide the spinner; the next event will be
          // the actual `playing` event from the <video> element.
          hls.on(Hls.Events.FRAG_LOADED, () => {
            setLoading(false);
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            emitStats(hls.levels?.[data?.level]);
          });
          hls.on(Hls.Events.ERROR, (_event, hlsData) => {
            if (!hlsData?.fatal) return;
            // manifestLoadError is a hard 4xx/5xx on the playlist itself —
            // no point retrying with the same loader, surface to the user
            // and report it so the channel gets auto-deactivated.
            const isManifestLoad =
              hlsData.type === Hls.ErrorTypes.NETWORK_ERROR &&
              (hlsData.details === 'manifestLoadError' ||
                hlsData.details === 'manifestLoadTimeOut' ||
                hlsData.details === 'manifestParsingError');
            if (isManifestLoad) {
              setError({
                title: 'Stream no disponible',
                detail:
                  'La fuente no responde. La URL puede haber cambiado o estar caída.',
                fatal: true,
              });
              setLoading(false);
              if (channel?.id) {
                api.reportChannelError(channel.id).then((res) => {
                  if (res?.deactivated) notifyChannelsChanged();
                });
              }
              return;
            }
            // Recoverable cases — let hls.js retry internally.
            if (hlsData.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
            if (hlsData.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            setError({
              title: 'Error de reproducción',
              detail: hlsData.details || hlsData.type || 'desconocido',
              fatal: true,
            });
            setLoading(false);
          });
          hlsRef.current = hls;
          return;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.addEventListener('loadedmetadata', () => {
            setLoading(false);
            video.play().catch((e) => console.warn('autoplay blocked:', e));
            // Native Safari HLS: no bitrate API, only intrinsic resolution.
            const fn = cbRef.current.onStreamStats;
            if (fn && video.videoWidth) {
              fn({
                width: video.videoWidth,
                height: video.videoHeight,
                bitrate: null,
                levelName: video.videoHeight ? `${video.videoHeight}p` : null,
              });
            }
          }, { once: true });
          return;
        }

        setError({
          title: 'Navegador incompatible',
          detail: 'Tu navegador no soporta HLS. Prueba con Chrome o Safari.',
          fatal: true,
        });
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError({
          title: 'Stream no disponible',
          detail: err.message || 'Error cargando stream',
          fatal: true,
        });
        setLoading(false);
        if (err.shouldReport && channel?.id) {
          api.reportChannelError(channel.id).then((res) => {
            if (res?.deactivated) notifyChannelsChanged();
          });
        }
      }
    };

    run();

    return cleanup;
  }, [channel?.slug, retryNonce]);

  return (
    <div className={styles.playerWrapper}>
      <video
        ref={videoRef}
        className={styles.player}
        controls={controls}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      />
      {channel && streamUrl && (
        <div className={styles.controls}>
          <CastButton
            streamUrl={streamUrl}
            channelName={channel.name}
            logoUrl={channel.logo_url}
            loading={loading}
          />
        </div>
      )}
      {!channel && (
        <div className={styles.placeholder}>
          <p>Selecciona un canal para ver el stream</p>
        </div>
      )}
      {loading && (
        <div className={styles.overlay}>
          {channel?.logo_url && (
            <img
              src={channel.logo_url}
              alt=""
              className={styles.overlayLogo}
              loading="eager"
              decoding="async"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <p className={styles.overlayPhase}>
            {loadingPhase === 'connecting' && 'Conectando con el canal…'}
            {loadingPhase === 'manifest' && 'Cargando stream…'}
            {loadingPhase === 'buffering' && 'Iniciando reproducción…'}
          </p>
        </div>
      )}
      {error && (
        <div className={styles.errorOverlay} role="alert">
          <div className={styles.errorPanel}>
            <span className={styles.errorBadge}>
              <AlertTriangle size={12} strokeWidth={2.4} />
              SEÑAL PERDIDA
            </span>
            <h3 className={styles.errorTitle}>{error.title}</h3>
            <p className={styles.errorMsg}>{error.detail}</p>
            <div className={styles.errorActions}>
              <button
                type="button"
                className={styles.errorBtn}
                onClick={() => {
                  setError(null);
                  setRetryNonce((n) => n + 1);
                }}
              >
                <RefreshCw size={12} strokeWidth={2.4} />
                Reintentar
              </button>
              {onSkipChannel && (
                <button
                  type="button"
                  className={`${styles.errorBtn} ${styles.errorBtnPrimary}`}
                  onClick={() => onSkipChannel()}
                >
                  <SkipForward size={12} strokeWidth={2.4} />
                  Probar otro canal
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default forwardRef(VideoPlayer);
