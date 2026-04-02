import { Request, Response, NextFunction } from 'express';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../db/client.js';
import * as schema from '../db/schema/index.js';

/**
 * Tenant middleware:
 * 1. Reads tenantId from the JWT (set by auth middleware)
 * 2. Acquires a connection from the pool
 * 3. Sets RLS context: SET LOCAL app.current_tenant = tenantId
 * 4. Attaches a request-scoped Drizzle client to req.db
 * 5. Releases the connection when the response finishes
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: 'MissingTenant',
        message: 'No tenant context found. Ensure authentication is configured.',
      });
      return;
    }

    // Acquire a dedicated connection for this request
    const client = await pool.connect();

    try {
      // Set RLS context — all queries on this connection are now scoped to this tenant
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Create a request-scoped Drizzle instance
      req.db = drizzle(client, { schema });

      // Release connection when response finishes
      res.on('finish', () => {
        client.release();
      });

      // Also release on error to prevent connection leaks
      res.on('close', () => {
        client.release();
      });

      next();
    } catch (err) {
      client.release();
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
