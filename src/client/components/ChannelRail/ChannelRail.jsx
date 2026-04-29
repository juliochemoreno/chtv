import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ChannelCard from '../ChannelCard/ChannelCard';
import styles from './ChannelRail.module.css';

export default function ChannelRail({
  prefix = '//',
  title,
  meta,
  channels = [],
  currentChannel,
  isFavorite,
  onToggleFavorite,
  onSelect,
  emptyLabel = 'Sin canales disponibles',
  accent = 'lime',
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: true,
    skipSnaps: true,
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateNav = useCallback((api) => {
    if (!api) return;
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    updateNav(emblaApi);
    emblaApi.on('select', updateNav);
    emblaApi.on('reInit', updateNav);
    emblaApi.on('scroll', updateNav);
    return () => {
      emblaApi.off('select', updateNav);
      emblaApi.off('reInit', updateNav);
      emblaApi.off('scroll', updateNav);
    };
  }, [emblaApi, updateNav]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const count = channels.length;
  const metaLabel = meta ?? `${String(count).padStart(2, '0')} CANALES`;

  return (
    <section className={styles.rail} data-accent={accent}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.prefix}>{prefix}</span>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.metaSep} />
          <span className={styles.meta}>{metaLabel}</span>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.ctrl}
            onClick={scrollPrev}
            disabled={!canPrev}
            aria-label="Anterior"
          >
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className={styles.ctrl}
            onClick={scrollNext}
            disabled={!canNext}
            aria-label="Siguiente"
          >
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      {count === 0 ? (
        <div className={styles.empty}>{emptyLabel}</div>
      ) : (
        <div className={styles.viewport} ref={emblaRef}>
          <div className={styles.track}>
            {channels.map((channel, index) => (
              <div className={styles.slide} key={channel.id}>
                <ChannelCard
                  channel={channel}
                  isSelected={currentChannel?.id === channel.id}
                  onSelect={onSelect}
                  isFavorite={isFavorite ? isFavorite(channel.id) : false}
                  onToggleFavorite={onToggleFavorite}
                  index={index}
                  variant="tile"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
