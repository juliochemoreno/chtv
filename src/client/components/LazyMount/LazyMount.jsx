import { useEffect, useRef, useState } from 'react';

/**
 * Renders nothing until the wrapper enters (or approaches) the viewport,
 * then mounts `children` permanently.
 *
 * Why this exists: the Home page lays out one `ChannelRail` per category.
 * Each rail mounts its own Embla carousel with scroll observers. With ~10
 * categories that's ~10 Embla instances on first paint, all observing
 * scroll/resize and laying out their own slides. Wrapping the rails below
 * the fold in <LazyMount> lets the first paint render only the rails the
 * user can see, and the rest spin up as they scroll near them.
 *
 * Props:
 *   - children:           the heavy subtree to mount lazily
 *   - placeholderHeight:  reserved space (px) so the layout doesn't shift
 *                         when children mount. Pick a value close to the
 *                         expected rendered height.
 *   - rootMargin:         how far below the viewport to consider as "near"
 *                         (defaults to '400px' — start mounting before the
 *                         user actually reaches the rail).
 *   - eager:              skip the observer and mount immediately (used for
 *                         the first rail in the list).
 */
export default function LazyMount({
  children,
  placeholderHeight = 320,
  rootMargin = '400px',
  eager = false,
}) {
  const wrapRef = useRef(null);
  const [mounted, setMounted] = useState(eager);

  useEffect(() => {
    if (mounted) return;
    const el = wrapRef.current;
    if (!el) return;
    // Browsers without IntersectionObserver (extremely rare today) fall back
    // to immediate mount.
    if (typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  return (
    <div
      ref={wrapRef}
      style={mounted ? undefined : { minHeight: placeholderHeight }}
    >
      {mounted ? children : null}
    </div>
  );
}
