// In-memory rate limiter — namespace + key 버킷. 단일 인스턴스 기준 (서버리스 cold start 시 리셋).
// Claude API 비용 / OG sharp CPU 보호용 1차 방어선. 분산 환경에선 best-effort.

type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

function getStore(namespace: string): Map<string, Bucket> {
  let s = stores.get(namespace);
  if (!s) {
    s = new Map();
    stores.set(namespace, s);
  }
  return s;
}

export function checkRateLimit(opts: {
  namespace: string;
  key: string;
  max: number;
  windowMs: number;
}): { ok: boolean; remaining: number; resetAt: number } {
  const store = getStore(opts.namespace);
  const now = Date.now();
  const entry = store.get(opts.key);

  if (!entry || entry.resetAt < now) {
    store.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.max - 1, resetAt: now + opts.windowMs };
  }
  if (entry.count >= opts.max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { ok: true, remaining: opts.max - entry.count, resetAt: entry.resetAt };
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function maybeSweepExpired(): void {
  if (Math.random() > 0.01) return;
  const now = Date.now();
  stores.forEach((store) => {
    const expired: string[] = [];
    store.forEach((bucket, key) => {
      if (bucket.resetAt < now) expired.push(key);
    });
    expired.forEach((key) => store.delete(key));
  });
}
