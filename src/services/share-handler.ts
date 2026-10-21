// Vue caches a lifecycle wrapper on the callback itself (__weh). Register a fresh
// callback for every page instance so re-entering a page cannot reuse a wrapper
// bound to an unmounted instance and silently lose its share title/image/path.
export function createPageShareHandler<T>(payload: () => T): () => T {
  return () => payload()
}
