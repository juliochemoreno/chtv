import { useEffect, useRef, useState } from 'react';

/**
 * Incremental grid: renders a slice of `items` and grows the slice as the
 * sentinel near the bottom enters the viewport.
 *
 * Why not full virtualization (react-window etc.): those introduce an
 * internal scroll container, which conflicts with the project's pattern of
 * a sticky page header + native window scroll. PagedGrid keeps the native
 * scroll intact — it only limits how many cards are mounted at once.
 *
 * The DOM grows monotonically (we don't unmount cards above the viewport),
 * so it's not memory-perfect. But for the realistic upper bound (~600
 * channels) the worst case is "all cards mounted after a long scroll",
 * which behaves identically to the legacy non-paged grid. The win is the
 * initial paint and the typical-case cost when the user filters and never
 * scrolls past the first page.
 *
 * Props:
 *   - items:         array to render
 *   - pageSize:      how many items to add per page (default 60)
 *   - renderItem:    (item, index) => ReactNode
 *   - keyForItem:    (item) => key (defaults to item.id)
 *   - className:     wrapper className (the wrapper is a CSS Grid in the
 *                    callsite; we keep this component layout-agnostic so
 *                    Channels and AdminDashboard can each use their own)
 *   - sentinelRootMargin: how far below the viewport to start loading the
 *                    next page. Defaults to "600px" so the next slice is
 *                    ready before the user reaches the end.
 */
export default function PagedGrid({
  items,
  pageSize = 60,
  renderItem,
  keyForItem = (item) => item.id,
  className,
  sentinelRootMargin = '600px',
}) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef(null);

  // Reset the visible window whenever the items array changes (filter,
  // sort, refresh). Otherwise stale visibleCount can be larger than the
  // new items length, or smaller than the user's previously-loaded slice.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    if (visibleCount >= items.length) return; // nothing more to load
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
        }
      },
      { rootMargin: sentinelRootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, visibleCount, pageSize, sentinelRootMargin]);

  const visible = visibleCount >= items.length ? items : items.slice(0, visibleCount);

  return (
    <>
      <div className={className}>
        {visible.map((item, index) => (
          <div key={keyForItem(item)}>{renderItem(item, index)}</div>
        ))}
      </div>
      {visibleCount < items.length && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          // 1px tall — only there to be observed.
          style={{ height: 1, width: '100%' }}
        />
      )}
    </>
  );
}
