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
    'Get the latest cash flow snapshot with 30-day and 90-day projections',
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
    async (args) => ({
      message: 'Cash flow module will be available in Phase 3.',
      requested_days: args.days || 30,
    })
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
    async (args) => ({
      message: 'Invoice module will be available in Phase 3.',
      limit: args.limit || 10,
    })
  );

  // ─── Placeholder CRM Tools (Phase 3) ─────────────────

  registry.register(
    'list_deals_by_stage',
    'List all deals grouped by their pipeline stage',
    {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'Filter by specific stage (e.g., discovery, proposal, negotiation, closed)',
        },
      },
      required: [],
    },
    async (args) => ({
      message: 'CRM module will be available in Phase 3.',
      stage_filter: args.stage || 'all',
    })
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
    async (args) => ({
      message: 'CRM module will be available in Phase 3.',
      contact: args,
    })
  );

  return registry;
}
