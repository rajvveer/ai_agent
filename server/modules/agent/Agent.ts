import { Request } from 'express';
import { db } from '../../db/client.js';
import { agentConversations, agentMessages, agentActionsLog } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { chatCompletion, ChatMessage, ToolDefinition, LLMResponse } from '../../lib/llm.js';
import { getToolRegistry, ToolRegistry, ToolResult } from './toolRegistry.js';

const MAX_CONTEXT_MESSAGES = 20;
const MAX_TOOL_LOOPS = 10;

const SYSTEM_PROMPT = `You are Business Copilot — an AI assistant that helps small and medium businesses manage their operations.

You have access to tools for Finance, CRM, Marketing, Hiring, and more. When the user asks a question:
1. Think about what information you need
2. Use the appropriate tools to get data
3. Analyze the results
4. Provide a clear, actionable answer

Be concise, professional, and data-driven. Always cite specific numbers when available.
When you don't have access to make data or specific numbers up, be honest about it.
If a tool fails, explain what happened and suggest alternatives.`;

export class Agent {
  private tenantId: string;
  private userId: string;
  private toolRegistry: ToolRegistry;
  private conversationId: string | null = null;

  constructor(req: Request) {
    this.tenantId = req.tenantId!;
    this.userId = req.userId!;
    this.toolRegistry = getToolRegistry(req);
  }

  /**
   * Run the ReAct loop for a given user message
   * Yields text chunks for SSE streaming
   */
  async *run(
    message: string,
    conversationId?: string
  ): AsyncGenerator<string> {
    this.conversationId = conversationId || null;

    // 1. Build context
    const context = await this.buildContext(message);

    // 2. ReAct loop
    let loopCount = 0;
    let loop = true;

    while (loop && loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const response = await chatCompletion(context, {
        tools: this.toolRegistry.getToolDefinitions(),
        temperature: 0.7,
      });

      // Track LLM usage
      await this.logUsage(response);

      if (response.hasToolCalls) {
        // Execute tools
        const toolResults = await this.executeTools(response.toolCalls);

        // Add assistant message with tool calls
        context.push({
          role: 'assistant',
          content: response.content || '',
        });

        // Add tool results
        for (const result of toolResults) {
          context.push({
            role: 'tool',
            content: JSON.stringify(result.output),
            tool_call_id: result.toolCallId,
            name: result.toolName,
          });
        }

        // Log tool executions
        await this.logToolExecutions(toolResults);
      } else {
        // Final text response — yield for streaming
        const text = response.content || 'I apologize, but I was unable to generate a response.';
        yield text;
        loop = false;

        // Add final assistant message to context for persistence
        context.push({
          role: 'assistant',
          content: text,
        });
      }
    }

    if (loopCount >= MAX_TOOL_LOOPS) {
      yield '\n\n⚠️ I reached the maximum number of tool calls. Here is what I found so far.';
    }

    // 3. Persist conversation
    await this.persistConversation(context, message);
  }

  /**
   * Build conversation context with history and system prompt
   */
  private async buildContext(newMessage: string): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Load conversation history if continuing an existing conversation
    if (this.conversationId) {
      const history = await db
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, this.conversationId))
        .orderBy(desc(agentMessages.createdAt))
        .limit(MAX_CONTEXT_MESSAGES);

      // Reverse to chronological order
      for (const msg of history.reverse()) {
        messages.push({
          role: msg.role as ChatMessage['role'],
          content: msg.content || '',
        });
      }
    }

    // Add new user message
    messages.push({ role: 'user', content: newMessage });

    return messages;
  }

  /**
   * Execute tool calls from the LLM response
   */
  private async executeTools(
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const tc of toolCalls) {
      const startTime = Date.now();
      try {
        const args = JSON.parse(tc.arguments);
        const output = await this.toolRegistry.executeTool(tc.name, args);
        results.push({
          toolCallId: tc.id,
          toolName: tc.name,
          output,
          success: true,
          durationMs: Date.now() - startTime,
        });
      } catch (err: any) {
        results.push({
          toolCallId: tc.id,
          toolName: tc.name,
          output: { error: err.message || 'Tool execution failed' },
          success: false,
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Persist conversation messages to the database
   */
  private async persistConversation(context: ChatMessage[], userMessage: string): Promise<void> {
    try {
      // Create conversation if new
      if (!this.conversationId) {
        // Generate a title from the first message
        const title = userMessage.length > 100
          ? userMessage.slice(0, 97) + '...'
          : userMessage;

        const [conversation] = await db
          .insert(agentConversations)
          .values({
            tenantId: this.tenantId,
            userId: this.userId,
            title,
            channel: 'web',
          })
          .returning();

        this.conversationId = conversation.id;
      }

      // Persist new messages (skip system prompt and already-persisted history)
      // Only persist user message and final assistant message
      const newMessages = context.filter(
        (m) => m.role !== 'system'
      );

      // Get count of existing messages
      const existing = await db
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, this.conversationId!));

      // Only insert messages that are new
      const messagesToInsert = newMessages.slice(existing.length);

      for (const msg of messagesToInsert) {
        await db.insert(agentMessages).values({
          conversationId: this.conversationId!,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.role === 'assistant' ? null : undefined,
        });
      }
    } catch (err) {
      console.error('[Agent] Failed to persist conversation:', err);
    }
  }

  /**
   * Log LLM usage for cost tracking
   */
  private async logUsage(response: LLMResponse): Promise<void> {
    try {
      const { llmUsageLog } = await import('../../db/schema/index.js');
      await db.insert(llmUsageLog).values({
        tenantId: this.tenantId,
        userId: this.userId,
        model: response.model,
        provider: response.provider,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: '0', // TODO: Calculate based on provider pricing
      });
    } catch (err) {
      console.error('[Agent] Failed to log usage:', err);
    }
  }

  /**
   * Log tool executions to audit trail
   */
  private async logToolExecutions(results: ToolResult[]): Promise<void> {
    try {
      for (const result of results) {
        await db.insert(agentActionsLog).values({
          tenantId: this.tenantId,
          userId: this.userId,
          actionType: `tool:${result.toolName}`,
          moduleName: result.toolName.split('_')[0] || 'agent',
          payload: { args: 'redacted' }, // Don't log sensitive tool arguments
          outcome: {
            success: result.success,
            durationMs: result.durationMs,
          },
          durationMs: result.durationMs,
        });
      }
    } catch (err) {
      console.error('[Agent] Failed to log tool executions:', err);
    }
  }
}
