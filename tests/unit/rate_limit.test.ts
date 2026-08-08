import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter } from '../../src/middleware/rate_limit.js';

describe('Rate Limiter Middleware Unit Tests', () => {
  let app: Hono;
  let rateLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    rateLimiter = createRateLimiter({ max: 3, windowMs: 10000 });
    app = new Hono();
    app.use('*', rateLimiter.middleware);
    app.get('/test', (c) => c.json({ success: true }));
  });

  it('should allow requests under the maximum quota', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(3 - i));
    }
  });

  it('should block requests exceeding the maximum quota with HTTP 429', async () => {
    // Send 3 allowed requests
    for (let i = 0; i < 3; i++) {
      await app.request('/test');
    }

    // 4th request should fail
    const res = await app.request('/test');
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.has('Retry-After')).toBe(true);

    const body = (await res.json()) as any;
    expect(body.error).toBe('Too Many Requests');
  });

  it('should reset limits after manual reset', async () => {
    // Exceed limit
    for (let i = 0; i < 4; i++) {
      await app.request('/test');
    }

    rateLimiter.reset();

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
  });
});
