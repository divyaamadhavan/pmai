// In-memory cache replacing Redis — no external dependencies needed.
const store = new Map<string, { value: string; expiresAt?: number }>();

export async function connectRedis(): Promise<void> {
  console.log('[Cache] Using in-memory cache (no Redis required)');
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  try { return JSON.parse(entry.value) as T; } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  store.set(key, {
    value: JSON.stringify(value),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  });
}

export async function cacheDel(...keys: string[]): Promise<void> {
  keys.forEach((k) => store.delete(k));
}
