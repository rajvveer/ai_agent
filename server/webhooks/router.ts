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

// ─── WhatsApp webhook ──────────────────────────────────
webhookRouter.post(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    // TODO: Process inbound WhatsApp messages
    // TODO: Route to agent loop
    console.log('[Webhook] WhatsApp message received');
    res.json({ received: true });
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
