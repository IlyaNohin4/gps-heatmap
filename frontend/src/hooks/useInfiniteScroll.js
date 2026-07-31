import { useEffect, useRef } from 'react';

// sentinel-based infinite scroll: observes a "часовой" div at the end of a
// list and calls loadMore() when it enters the viewport of `rootRef`'s
// element. Disabled while hasMore is false; guards against overlapping
// loadMore calls.
//
// `rootRef` MUST point at the actual scrollable container (the div with
// overflow-y: auto), not left undefined — with no root, IntersectionObserver
// falls back to the browser viewport, and a short first page (e.g. 50 items
// that don't fill the container) leaves the sentinel already inside the
// viewport, firing loadMore immediately on mount before the user scrolls at
// all (page 1 + page 2 both load before anything renders).
export default function useInfiniteScroll(loadMore, hasMore, rootRef) {
  const sentinelRef = useRef(null);
  const loadingGuard = useRef(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (loadingGuard.current) return;
        loadingGuard.current = true;
        Promise.resolve(loadMore()).finally(() => {
          loadingGuard.current = false;
        });
      },
      { root: rootRef?.current ?? null, rootMargin: '100px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore, rootRef]);

  return sentinelRef;
}
