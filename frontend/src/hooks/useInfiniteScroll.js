import { useEffect, useRef } from 'react';

// sentinel-based infinite scroll: observes a "часовой" div at the end of a
// list and calls loadMore() when it enters the viewport of `rootRef`'s
// element. Disabled while hasMore is false; guards against overlapping
// loadMore calls.
//
// `rootRef` MUST point at the actual scrollable container (the div with
// overflow-y: auto), not left undefined — with no root, IntersectionObserver
// falls back to the browser viewport.
//
// By design the first page always stays at exactly the requested page size,
// even if it doesn't fill the container (leaving empty space below it) — see
// the `skippedInitial` guard below.
export default function useInfiniteScroll(loadMore, hasMore, rootRef) {
  const sentinelRef = useRef(null);
  const loadingGuard = useRef(false);
  // Callers pass a useCallback keyed on items.length, so its identity
  // changes on every appended page. Reading it through a ref (instead of
  // putting it in the effect's deps) keeps the observer instance stable —
  // otherwise each loadMore identity change tears down and recreates the
  // IntersectionObserver, which re-checks intersection immediately on
  // creation. If layout hasn't repainted yet at that instant, it reports
  // "still intersecting" and fires again — cascading into 2-3 extra pages
  // loading back-to-back before the real geometry ever gets checked.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    // `cancelled` guards against React 18 StrictMode's dev-only double
    // effect invocation (mount → cleanup → mount): IntersectionObserver
    // delivers its initial "is this already intersecting" notification
    // asynchronously, so it's possible for that notification to still be
    // in flight when the transient first mount's cleanup runs. disconnect()
    // alone isn't a reliable-enough guarantee against every browser's
    // delivery timing, so we also check this flag inside the callback.
    let cancelled = false;

    // IntersectionObserver always delivers one synchronous-ish "initial
    // state" report the instant observe() is called, regardless of whether
    // the user has scrolled. On a tall viewport a short first page can
    // already leave the sentinel inside the container (+ rootMargin), so
    // without this guard that initial report auto-loads a second page
    // before the user ever scrolls (50 → 100 with zero interaction).
    // Skipping it means loadMore only ever fires in response to a real
    // intersection change — i.e. an actual scroll.
    let skippedInitial = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (cancelled) return;
        if (!skippedInitial) {
          skippedInitial = true;
          return;
        }
        if (!entries[0].isIntersecting) return;
        if (loadingGuard.current) return;
        loadingGuard.current = true;
        Promise.resolve(loadMoreRef.current()).finally(() => {
          loadingGuard.current = false;
        });
      },
      { root: rootRef?.current ?? null, rootMargin: '100px' }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasMore, rootRef]);

  return sentinelRef;
}
