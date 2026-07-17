/**
 * Rate limiting de ventana fija en memoria, por IP + bucket.
 *
 * Suficiente para una instancia única (Railway). Si la app escala
 * horizontalmente, cada réplica tiene su propio contador — el límite
 * efectivo se multiplica por N réplicas; para un límite global exacto
 * se migraría a un almacén compartido (Redis) sin tocar a los callers.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_ENTRIES = 20_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_ENTRIES) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      // Si sigue llena tras purgar expirados, se descarta la más vieja.
      if (buckets.size >= MAX_ENTRIES) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
