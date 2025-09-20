interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TimedCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) {
      return undefined;
    }
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export class InFlightMap<T> {
  private readonly store = new Map<string, { promise: Promise<T>; abort: () => void }>();

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, entry: { promise: Promise<T>; abort: () => void }) {
    this.store.set(key, entry);
  }

  delete(key: string) {
    this.store.delete(key);
  }

  cancelAll() {
    for (const { abort } of this.store.values()) {
      abort();
    }
    this.store.clear();
  }
}
