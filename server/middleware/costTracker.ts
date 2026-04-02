import { Request, Response, NextFunction } from 'express';
import { db } from '../db/client.js';
import { llmUsageLog } from '../db/schema/index.js';

/**
 * Cost tracker middleware:
 * Attaches a `trackLLMUsage` function to the request object.
 * This function is called by the LLM client wrapper after every completion.
 * Logs usage to llm_usage_log table for reseller billing and cost dashboards.
 */
export function costTracker(req: Request, res: Response, next: NextFunction): void {
  // Attach tracking function to request context
  (req as any).trackLLMUsage = async (usage: {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
    toolName?: string;
  }) => {
    try {
      const tenantId = req.tenantId;
      const userId = req.userId;

      if (!tenantId) return;

      await db.insert(llmUsageLog).values({
        tenantId,
        userId: userId || null,
        model: usage.model,
        provider: usage.provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd?.toFixed(6) || '0',
        toolName: usage.toolName || null,
      });
    } catch (err) {
      console.error('[CostTracker] Failed to log usage:', err);
      // Don't throw — cost tracking failure shouldn't break the request
    }
  };

  next();
}
