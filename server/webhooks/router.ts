import { Router, Request, Response, NextFunction } from 'express';

export const webhookRouter = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Stripe webhook ────────────────────────────────────
webhookRouter.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    // TODO: Verify Stripe webhook signature
    // TODO: Handle payment events (invoice.paid, payment_intent.succeeded, etc.)
    console.log('[Webhook] Stripe event received:', req.body?.type);
    res.json({ received: true });
  })
);

import { parseInboundMessage } from '../lib/whatsapp.js';
import { db } from '../db/client.js';
import { whatsappConfig } from '../db/schema/crm.js';
import { eq } from 'drizzle-orm';
import { queues } from '../scheduler/index.js'; // Ensure we can enqueue

// ─── WhatsApp webhook ──────────────────────────────────

// Webhook verification (GET)
webhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming messages (POST)
webhookRouter.post(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    // 1. Respond quickly to acknowledge receipt
    res.status(200).send('EVENT_RECEIVED');

    // 2. Parse inbound message
    const parsed = parseInboundMessage(req.body);
    if (!parsed) return; // not a text message or invalid structure

    console.log(`[Webhook] WhatsApp message from ${parsed.from}: ${parsed.text}`);

    // 3. Find tenant by the number that received this? 
    // In Meta Cloud API, we typically know which number received it from metadata.
    // For simplicity, let's assume we map the incoming number (if available) or the entire webhook endpoint is tenant-specific.
    // If using a global webhook, you receive the destination phone number ID in payload.
    const displayPhoneNumber = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;
    
    if (!displayPhoneNumber) return;

    const [config] = await db.select().from(whatsappConfig)
      .where(eq(whatsappConfig.phoneNumber, displayPhoneNumber))
      .limit(1);

    if (!config || !config.active) {
      console.log(`[Webhook] No active config found for ${displayPhoneNumber}`);
      return;
    }

    // 4. In a real scenario, we'd trigger the agent loop here.
    // Agent.run() requires a Request object with tenantId/userId, or we run it programmatically.
    // Here we will just echo back via the outbound queue as proof of concept.
    console.log(`[Webhook] Routing message for tenant ${config.tenantId} to Agent -> Outbound`);
    
    // Simulate Agent response by appending "Agent says: " and echoing
    const agentResponse = `Agent received: "${parsed.text}". (LLM processing simulated)`;

    // 5. Queue outbound message
    await queues['whatsapp-outbound']?.add('send-message', {
      tenantId: config.tenantId,
      to: parsed.from,
      message: agentResponse,
      provider: config.provider,
      apiKey: config.apiKey,
      phoneNumberId: config.phoneNumberId,
    });
  })
);

// ─── Voice webhook ─────────────────────────────────────
webhookRouter.post(
  '/voice',
  asyncHandler(async (req, res) => {
    // TODO: Handle Twilio voice inbound
    // TODO: Stream audio to Whisper ASR → Agent → ElevenLabs TTS
    console.log('[Webhook] Voice call received');
    res.json({ received: true });
  })
);

// ─── Health check ──────────────────────────────────────
webhookRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
