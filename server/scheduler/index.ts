import cron from 'node-cron';
import { Queue } from 'bullmq';
import { db } from '../db/client.js';
import { scheduledTasks } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { redis } from '../lib/redis.js';

// BullMQ queues
const queues: Record<string, Queue> = {
  'email-outbound': new Queue('email-outbound', { connection: redis }),
  'whatsapp-outbound': new Queue('whatsapp-outbound', { connection: redis }),
  'invoice-reminders': new Queue('invoice-reminders', { connection: redis }),
  'embedding-pipeline': new Queue('embedding-pipeline', { connection: redis }),
};

/**
 * Start the cron scheduler.
 * 1. Reads all active scheduled_tasks from the database
 * 2. Registers a cron job per tenant per task type
 * 3. Each cron job fires a BullMQ job when triggered
 */
export async function startScheduler(): Promise<void> {
  try {
    // Read active tasks from DB
    const tasks = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.active, true));

    let registered = 0;

    for (const task of tasks) {
      if (!cron.validate(task.cronExpr)) {
        console.warn(`[Scheduler] Invalid cron expression for task ${task.id}: "${task.cronExpr}"`);
        continue;
      }

      const queue = queues[task.taskType];
      if (!queue) {
        console.warn(`[Scheduler] No queue found for task type: ${task.taskType}`);
        continue;
      }

      cron.schedule(task.cronExpr, async () => {
        try {
          console.log(`[Scheduler] Firing ${task.taskType} for tenant ${task.tenantId}`);
          await queue.add(task.taskType, {
            tenantId: task.tenantId,
            params: task.params,
          });

          // Update last_run
          await db
            .update(scheduledTasks)
            .set({ lastRun: new Date() })
            .where(eq(scheduledTasks.id, task.id));
        } catch (err) {
          console.error(`[Scheduler] Failed to fire ${task.taskType}:`, err);
        }
      });

      registered++;
    }

    console.log(`[Scheduler] ✓ ${registered} cron jobs registered from ${tasks.length} scheduled tasks`);
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err);
    // Don't throw — scheduler failure shouldn't prevent app startup
  }
}

export { queues };
