import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';

const WINDOW_SIZE_SECONDS = 60;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100');

/**
 * Redis sliding window rate limiter:
 * - 100 requests per minute per tenant
 * - Falls back to IP-based limiting for unauthenticated routes
 * - Returns 429 with Retry-After header on breach
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Use tenant_id if available, otherwise fall back to IP
    const identifier = req.tenantId || req.ip || 'unknown';
    const key = `rl:${identifier}`;
    const now = Date.now();
    const windowStart = now - (WINDOW_SIZE_SECONDS * 1000);

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Remove entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Add current request
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    // Count requests in window
    pipeline.zcard(key);
    // Set TTL to auto-cleanup
    pipeline.expire(key, WINDOW_SIZE_SECONDS);

    const results = await pipeline.exec();

    if (!results) {
      next();
      return;
    }

    const requestCount = results[2]?.[1] as number;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - requestCount));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + WINDOW_SIZE_SECONDS * 1000) / 1000));

    if (requestCount > MAX_REQUESTS) {
      res.setHeader('Retry-After', WINDOW_SIZE_SECONDS);
      res.status(429).json({
        error: 'RateLimitExceeded',
        message: `Too many requests. Limit: ${MAX_REQUESTS} per ${WINDOW_SIZE_SECONDS}s. Try again later.`,
        retryAfter: WINDOW_SIZE_SECONDS,
      });
      return;
    }

    next();
  } catch (err) {
    // Don't block requests if rate limiter fails — fail open
    console.error('[RateLimiter] Error:', err);
    next();
  }
}
