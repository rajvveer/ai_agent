import { Request } from 'express';
import { ToolDefinition } from '../../lib/llm.js';

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
  success: boolean;
  durationMs: number;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool with its definition and handler
   */
  register(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    handler: ToolHandler
  ): void {
    this.tools.set(name, {
      definition: {
        type: 'function',
        function: {
          name,
          description,
          parameters,
        },
      },
      handler,
    });
  }

  /**
   * Get all tool definitions for the LLM
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(args);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get count of registered tools
   */
  get size(): number {
    return this.tools.size;
  }
}

/**
 * Build the tool registry with request context injected
 * Tools can access req.db (RLS-scoped) and req.tenantId
 */
export function getToolRegistry(req: Request): ToolRegistry {
  const registry = new ToolRegistry();

  // ─── System Tools (always available) ─────────────────

  registry.register(
    'get_current_time',
    'Get the current date and time in ISO format',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async () => ({
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  );

  registry.register(
    'get_tenant_info',
    'Get information about the current tenant/organization',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async () => {
      // Basic tenant info — will be expanded in later phases
      return {
        tenantId: req.tenantId,
        message: 'Full tenant info will be available after Phase 3 integration.',
      };
    }
  );

  // ─── Placeholder Finance Tools (Phase 3) ─────────────

  registry.register(
    'get_cash_flow_snapshot',
    'Get the latest cash flow snapshot with recent forecast',
    {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to project (30 or 90)',
        },
      },
      required: [],
    },
    async (args) => {
      const { db } = req;
      if (!db || !req.tenantId) {
          throw new Error("No database context available");
      }
      // Import here to avoid circular dep issues if any, or just dynamic import
      const { cashflowForecasts } = await import('../../db/schema/finance.js');
      const { eq } = await import('drizzle-orm');
      
      const latest = await db.select().from(cashflowForecasts)
        .where(eq(cashflowForecasts.tenantId, req.tenantId))
        .limit(10); // fetch latest 10 and pick one

      if (latest.length === 0) {
          return { message: 'No cash flow forecast found. Trigger forecast generation first.' };
      }
      
      const mostRecent = latest.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
          forecast: mostRecent.forecast,
          generatedAt: mostRecent.generatedAt,
      };
    }
  );

  registry.register(
    'list_overdue_invoices',
    'List all overdue invoices for the current tenant',
    {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of invoices to return',
        },
      },
      required: [],
    },
    async (args) => {
      const { db } = req;
      if (!db || !req.tenantId) throw new Error("No database context");
      const { invoices } = await import('../../db/schema/finance.js');
      const { eq, and } = await import('drizzle-orm');

      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const overdueInvoices = await db.select().from(invoices)
        .where(and(
          eq(invoices.tenantId, req.tenantId),
          eq(invoices.status, 'overdue')
        ))
        .limit(limit);

      return { count: overdueInvoices.length, invoices: overdueInvoices };
    }
  );

  // ─── CRM Tools (Phase 3) ─────────────────────────────

  registry.register(
    'list_deals_by_stage',
    'List all deals grouped by their pipeline stage, or filter by a specific stage',
    {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'Filter by specific stage (e.g., discovery, proposal, negotiation, closed_won)',
        },
      },
      required: [],
    },
    async (args) => {
      const { db } = req;
      if (!db || !req.tenantId) throw new Error("No database context");
      const { deals } = await import('../../db/schema/crm.js');
      const { eq, and } = await import('drizzle-orm');
      
      const stageFilter = typeof args.stage === 'string' ? args.stage : undefined;
      let query = db.select().from(deals).where(eq(deals.tenantId, req.tenantId));
      if (stageFilter) {
          query = db.select().from(deals).where(and(eq(deals.tenantId, req.tenantId), eq(deals.stage, stageFilter)));
      }
      const results = await query;
      return { count: results.length, deals: results };
    }
  );

  registry.register(
    'create_contact',
    'Create a new contact in the CRM',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact full name' },
        email: { type: 'string', description: 'Contact email' },
        type: { type: 'string', description: 'lead or client' },
      },
      required: ['name'],
    },
    async (args) => {
      const { db } = req;
      if (!db || !req.tenantId) throw new Error("No database context");
      const { contacts } = await import('../../db/schema/crm.js');
      
      const [contact] = await db.insert(contacts).values({
        tenantId: req.tenantId,
        name: String(args.name),
        email: args.email ? String(args.email) : null,
        type: args.type === 'client' ? 'client' : 'lead',
      }).returning();
      return contact;
    }
  );

  registry.register(
    'log_activity',
    'Log an interaction or note about a contact or deal',
    {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        dealId: { type: 'string' },
        type: { type: 'string', description: 'Call, email, note, meeting' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['type', 'subject'],
    },
    async (args) => {
      const { db } = req;
      if (!db || !req.tenantId) throw new Error("No database context");
      const { activities } = await import('../../db/schema/crm.js');
      
      const [activity] = await db.insert(activities).values({
        tenantId: req.tenantId,
        userId: req.userId || null,
        type: String(args.type),
        subject: String(args.subject),
        body: args.body ? String(args.body) : null,
        contactId: args.contactId ? String(args.contactId) : null,
        dealId: args.dealId ? String(args.dealId) : null,
      }).returning();
      return activity;
    }
  );

  return registry;
}
