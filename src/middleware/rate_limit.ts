import type { MiddlewareHandler } from 'hono';

export interface RateLimiterOptions {
  /** Maximum number of requests allowed per window (default: 60) */
  max?: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
}

interface ClientRateRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: RateLimiterOptions = {}): {
  middleware: MiddlewareHandler;
  reset: () => void;
} {
  const max = options.max ?? 60;
  const windowMs = options.windowMs ?? 60000;
  const clients = new Map<string, ClientRateRecord>();

  const reset = () => {
    clients.clear();
  };

  const middleware: MiddlewareHandler = async (c, next) => {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1';

    const now = Date.now();
    let record = clients.get(ip);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      clients.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetTimeSeconds = Math.ceil((record.resetTime - now) / 1000);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetTimeSeconds));

    if (record.count > max) {
      c.header('Retry-After', String(resetTimeSeconds));
      return c.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${max} requests allowed per ${windowMs / 1000} seconds.`,
          retryAfterSeconds: resetTimeSeconds,
        },
        429
      );
    }

    await next();
  };

  return { middleware, reset };
}
