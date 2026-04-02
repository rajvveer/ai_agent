import { Request, Response, NextFunction } from 'express';

/**
 * Structured JSON request logger
 * Logs: tenant_id, user_id, method, path, status, latency_ms
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const latency = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: latency,
      tenantId: req.tenantId || null,
      userId: req.userId || null,
      userAgent: req.get('user-agent') || null,
      ip: req.ip,
      contentLength: res.get('content-length') || null,
    };

    // Color-coded status for dev
    if (process.env.NODE_ENV === 'development') {
      const statusColor = res.statusCode >= 500 ? '\x1b[31m' // red
        : res.statusCode >= 400 ? '\x1b[33m' // yellow
        : res.statusCode >= 300 ? '\x1b[36m' // cyan
        : '\x1b[32m'; // green
      const reset = '\x1b[0m';
      console.log(
        `${statusColor}${req.method} ${req.path} ${res.statusCode}${reset} ${latency}ms`
      );
    } else {
      // Production: structured JSON
      console.log(JSON.stringify(logEntry));
    }
  });

  next();
}
