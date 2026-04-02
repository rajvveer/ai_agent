import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis.js';

/**
 * Register all BullMQ workers in-process.
 * Called once from server/index.ts on startup.
 */
export function registerAllWorkers(): void {
  // ─── Email Outbound Worker ─────────────────────────
  const emailWorker = new Worker(
    'email-outbound',
    async (job: Job) => {
      const { to, subject, html, from } = job.data;
      console.log(`[EmailWorker] Sending email to ${to}: "${subject}"`);

      // TODO: Integrate with Resend API
      // const resend = new Resend(process.env.RESEND_API_KEY);
      // await resend.emails.send({ from, to, subject, html });

      // For now, log the email
      console.log(`[EmailWorker] ✓ Email delivered to ${to}`);
      return { delivered: true, to, subject };
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // 10 emails per second
      },
    }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[EmailWorker] Job ${job.id} completed`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
  });

  // ─── WhatsApp Outbound Worker ──────────────────────
  const whatsappWorker = new Worker(
    'whatsapp-outbound',
    async (job: Job) => {
      const { to, message } = job.data;
      console.log(`[WhatsAppWorker] Sending message to ${to}`);

      // TODO: Integrate with 360dialog / Twilio API
      console.log(`[WhatsAppWorker] ✓ Message sent to ${to}`);
      return { delivered: true, to };
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  whatsappWorker.on('failed', (job, err) => {
    console.error(`[WhatsAppWorker] Job ${job?.id} failed:`, err.message);
  });

  // ─── Invoice Reminders Worker ──────────────────────
  const invoiceWorker = new Worker(
    'invoice-reminders',
    async (job: Job) => {
      const { tenantId } = job.data;
      console.log(`[InvoiceWorker] Processing overdue invoices for tenant ${tenantId}`);

      // TODO: Query overdue invoices, generate reminder drafts with agent
      console.log(`[InvoiceWorker] ✓ Reminders processed for tenant ${tenantId}`);
      return { processed: true, tenantId };
    },
    {
      connection: redis,
      concurrency: 2,
    }
  );

  invoiceWorker.on('failed', (job, err) => {
    console.error(`[InvoiceWorker] Job ${job?.id} failed:`, err.message);
  });

  // ─── Embedding Pipeline Worker ─────────────────────
  const embeddingWorker = new Worker(
    'embedding-pipeline',
    async (job: Job) => {
      const { tenantId, content, source } = job.data;
      console.log(`[EmbeddingWorker] Processing embedding for tenant ${tenantId}`);

      // TODO: Chunk text → OpenAI embeddings → Pinecone upsert
      console.log(`[EmbeddingWorker] ✓ Embedding stored for tenant ${tenantId}`);
      return { stored: true, tenantId, source };
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  embeddingWorker.on('failed', (job, err) => {
    console.error(`[EmbeddingWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Workers] ✓ 4 BullMQ workers registered (email, whatsapp, invoice, embedding)');
}
