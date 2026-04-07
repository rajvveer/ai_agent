import { eq, and, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoices } from '../db/schema/finance.js';
import { activities } from '../db/schema/crm.js';
import { queues } from '../scheduler/index.js';

export async function processOverdueInvoices(tenantId: string): Promise<{
  markedOverdue: number;
  remindersQueued: number;
}> {
  // Find invoices that are 'sent' (not yet paid) and past their due date
  // using Javascript filtering for simplicity or standard ORM depending on complexity.
  // We'll use Drizzle ORM directly.
  const pastDue = await db.select().from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.status, 'sent'),
        lt(invoices.dueDate, new Date())
      )
    );

  if (pastDue.length === 0) {
    return { markedOverdue: 0, remindersQueued: 0 };
  }

  let markedOverdue = 0;
  let remindersQueued = 0;

  for (const inv of pastDue) {
    // 1. Mark as overdue
    await db.update(invoices)
      .set({ status: 'overdue', updatedAt: new Date() })
      .where(eq(invoices.id, inv.id));
    
    markedOverdue++;

    // 2. Queue Email Reminder
    if (inv.customerEmail) {
      await queues['email-outbound']?.add('send-email', {
        tenantId,
        to: inv.customerEmail,
        subject: `Reminder: Invoice Overdue - ${inv.customerName}`,
        html: `<p>Hi ${inv.customerName},</p><p>Your invoice for ${inv.amount} is now overdue. Please proceed with payment.</p>`,
        from: process.env.OTP_FROM_EMAIL || 'noreply@yourdomain.com'
      });
      remindersQueued++;
    }

    // 3. Log activity in CRM (if we can find the contact, else just log generally without contactId)
    // We'll just log an activity generically for the tenant
    await db.insert(activities).values({
      tenantId,
      type: 'invoice_overdue',
      subject: `Invoice Overdue: ${inv.amount} for ${inv.customerName}`,
      body: `Status automatically updated to overdue via cron job.`,
    });
  }

  return { markedOverdue, remindersQueued };
}
