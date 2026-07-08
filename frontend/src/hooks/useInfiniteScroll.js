import { useEffect, useRef } from 'react';

// sentinel-based infinite scroll: observes a "часовой" div at the end of a
// list and calls loadMore() when it enters the viewport. Disabled while
// hasMore is false; guards against overlapping loadMore calls.
export default function useInfiniteScroll(loadMore, hasMore) {
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
      { rootMargin: '100px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return sentinelRef;
}
