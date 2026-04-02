import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet } from '../lib/redis.js';
import { db } from '../db/client.js';
import { featureFlags } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

// Module name → route prefix mapping
const MODULE_ROUTE_MAP: Record<string, string> = {
  '/api/agent': 'agent',
  '/api/finance': 'finance',
  '/api/crm': 'crm',
  '/api/marketing': 'marketing',
  '/api/hiring': 'hiring',
  '/api/voice': 'voice',
  '/api/competitor': 'competitor',
};

/**
 * Feature flag middleware:
 * 1. Determines which module the request targets based on route prefix
 * 2. Checks Redis cache for tenant's enabled modules
 * 3. Falls back to DB if cache miss
 * 4. Returns 403 if module is disabled for this tenant
 */
export async function featureFlagMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    // Determine which module this request targets
    const moduleName = Object.entries(MODULE_ROUTE_MAP).find(
      ([prefix]) => req.path.startsWith(prefix)
    )?.[1];

    // If route doesn't map to a specific module (e.g., /api/admin), skip check
    if (!moduleName) {
      next();
      return;
    }

    // Check Redis cache first
    const cacheKey = `ff:${tenantId}`;
    let enabledModules = await cacheGet<string[]>(cacheKey);

    if (!enabledModules) {
      // Cache miss — query DB
      const flags = await db
        .select()
        .from(featureFlags)
        .where(
          and(
            eq(featureFlags.tenantId, tenantId),
            eq(featureFlags.enabled, true)
          )
        );

      enabledModules = flags.map((f) => f.moduleName);

      // Cache for 5 minutes
      await cacheSet(cacheKey, enabledModules, 300);
    }

    req.features = enabledModules;

    // Check if the target module is enabled
    if (!enabledModules.includes(moduleName)) {
      res.status(403).json({
        error: 'ModuleDisabled',
        message: `The '${moduleName}' module is not enabled for your plan. Contact your administrator.`,
      });
      return;
    }

    next();
  } catch (err) {
    // Don't block requests if feature flag check fails — fail open
    console.error('[FeatureFlags] Check failed:', err);
    next();
  }
}
