import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Agent } from './Agent.js';
import { db } from '../../db/client.js';
import { agentConversations, agentMessages } from '../../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';

export const agentRouter = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Validation ────────────────────────────────────────

const messageSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
});

// ─── POST /api/agent/message ───────────────────────────
// Main entry point — streams SSE response from agent ReAct loop

agentRouter.post(
  '/message',
  asyncHandler(async (req, res) => {
    const { message, conversationId } = messageSchema.parse(req.body);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const agent = new Agent(req);

    try {
      for await (const chunk of agent.run(message, conversationId)) {
        // Send SSE event
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', content: err.message || 'Agent error' })}\n\n`
      );
    }

    res.end();
  })
);

// ─── POST /api/agent/chat ──────────────────────────────
// Non-streaming variant — returns full response as JSON

agentRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, conversationId } = messageSchema.parse(req.body);

    const agent = new Agent(req);
    let fullResponse = '';

    for await (const chunk of agent.run(message, conversationId)) {
      fullResponse += chunk;
    }

    res.json({
      response: fullResponse,
      conversationId: conversationId || null,
    });
  })
);

// ─── GET /api/agent/conversations ──────────────────────
// List all conversations for the current user

agentRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const conversations = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.tenantId, tenantId),
          eq(agentConversations.userId, userId)
        )
      )
      .orderBy(desc(agentConversations.updatedAt))
      .limit(50);

    res.json({ conversations });
  })
);

// ─── GET /api/agent/history/:id ────────────────────────
// Get full conversation message history

agentRouter.get(
  '/history/:id',
  asyncHandler(async (req, res) => {
    const conversationId = req.params.id as string;
    const tenantId = req.tenantId!;

    // Verify conversation belongs to this tenant
    const [conversation] = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, conversationId),
          eq(agentConversations.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt);

    res.json({ conversation, messages });
  })
);
