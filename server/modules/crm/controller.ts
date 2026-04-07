import { Request, Response } from 'express';
import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, deals, activities } from '../../db/schema/crm.js';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().optional().or(z.literal('')),
  type: z.enum(['lead', 'client']).default('lead'),
  source: z.string().optional().or(z.literal('')),
});

const dealSchema = z.object({
  contactId: z.string().uuid().optional(),
  title: z.string().min(1),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  stage: z.enum(['discovery', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).default('discovery'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const activitySchema = z.object({
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  type: z.string().min(1), // note, call, email, meeting, etc.
  subject: z.string().optional(),
  body: z.string().optional(),
});

// ─── Contacts ──────────────────────────────────────────

export const listContacts = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const type = req.query.type as string;
    const search = req.query.search as string;

    let query = db.select().from(contacts).where(eq(contacts.tenantId, tenantId));

    if (type) {
      query = db.select().from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.type, type)));
    }
    
    const results = await query.orderBy(desc(contacts.createdAt));
    
    if (search) {
      // In-memory filter for SQLite/Postgres simplicity if ilike is tricky, but let's just do it directly if we can,
      // For simplicity, doing it in memory if search is present
      const q = search.toLowerCase();
      res.json(results.filter(c => 
        c.name.toLowerCase().includes(q) || 
        (c.email && c.email.toLowerCase().includes(q)) || 
        (c.company && c.company.toLowerCase().includes(q))
      ));
    } else {
      res.json(results);
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list contacts' });
  }
};

export const createContact = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const parsed = contactSchema.parse(req.body);

    const [contact] = await db.insert(contacts).values({
      tenantId,
      ...parsed,
      email: parsed.email || null,
      phone: parsed.phone || null,
      company: parsed.company || null,
      source: parsed.source || null,
    }).returning();

    res.status(201).json(contact);
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid contact data', details: err });
  }
};

export const getContact = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, req.tenantId!)))
      .limit(1);

    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const recentActivities = await db.select().from(activities)
      .where(and(eq(activities.contactId, contact.id), eq(activities.tenantId, req.tenantId!)))
      .orderBy(desc(activities.createdAt))
      .limit(10);

    res.json({ ...contact, recentActivities });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get contact' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = contactSchema.partial().parse(req.body);
    const [updated] = await db.update(contacts)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, req.tenantId!)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Contact not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update contact' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db.delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, req.tenantId!)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted', id: deleted.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

// ─── Deals ─────────────────────────────────────────────

export const listDeals = async (req: Request, res: Response) => {
  try {
    const stage = req.query.stage as string;
    let baseQuery = db.select().from(deals).where(eq(deals.tenantId, req.tenantId!));
    
    if (stage) {
      baseQuery = db.select().from(deals).where(and(eq(deals.tenantId, req.tenantId!), eq(deals.stage, stage)));
    }
    
    const results = await baseQuery.orderBy(desc(deals.createdAt));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list deals' });
  }
};

export const createDeal = async (req: Request, res: Response) => {
  try {
    const parsed = dealSchema.parse(req.body);
    const [deal] = await db.insert(deals).values({
      tenantId: req.tenantId!,
      title: parsed.title,
      contactId: parsed.contactId || null,
      value: parsed.value?.toString() || '0',
      currency: parsed.currency,
      stage: parsed.stage,
      priority: parsed.priority,
    }).returning();

    // Auto log activity
    await db.insert(activities).values({
      tenantId: req.tenantId!,
      dealId: deal.id,
      contactId: deal.contactId,
      type: 'deal_created',
      subject: `Deal created: ${deal.title}`,
      userId: req.userId,
    });

    res.status(201).json(deal);
  } catch (err) {
    res.status(400).json({ error: 'Invalid deal data', details: err });
  }
};

export const getDeal = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [deal] = await db.select().from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, req.tenantId!)))
      .limit(1);

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const timeline = await db.select().from(activities)
      .where(and(eq(activities.dealId, deal.id), eq(activities.tenantId, req.tenantId!)))
      .orderBy(desc(activities.createdAt));

    res.json({ ...deal, timeline });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get deal' });
  }
};

export const updateDeal = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsed = dealSchema.partial().parse(req.body);
    
    const [existing] = await db.select().from(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, req.tenantId!)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Deal not found' });

    const toUpdate: any = { updatedAt: new Date() };
    if (parsed.title !== undefined) toUpdate.title = parsed.title;
    if (parsed.value !== undefined) toUpdate.value = parsed.value.toString();
    if (parsed.currency !== undefined) toUpdate.currency = parsed.currency;
    if (parsed.stage !== undefined) toUpdate.stage = parsed.stage;
    if (parsed.priority !== undefined) toUpdate.priority = parsed.priority;
    if (parsed.stage === 'closed_won' || parsed.stage === 'closed_lost') {
      toUpdate.closedAt = new Date();
    }

    const [updated] = await db.update(deals)
      .set(toUpdate)
      .where(eq(deals.id, id))
      .returning();

    // Auto log stage change
    if (parsed.stage && parsed.stage !== existing.stage) {
      await db.insert(activities).values({
        tenantId: req.tenantId!,
        dealId: id,
        contactId: existing.contactId,
        type: 'stage_change',
        subject: `Stage changed from ${existing.stage} to ${parsed.stage}`,
        userId: req.userId,
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update deal' });
  }
};

export const deleteDeal = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [deleted] = await db.delete(deals)
      .where(and(eq(deals.id, id), eq(deals.tenantId, req.tenantId!)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Deal not found' });
    res.json({ message: 'Deal deleted', id: deleted.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal' });
  }
};

export const getPipeline = async (req: Request, res: Response) => {
  try {
    const allDeals = await db.select().from(deals).where(eq(deals.tenantId, req.tenantId!));
    
    const pipeline: Record<string, { count: number, totalValue: number, deals: any[] }> = {
      discovery: { count: 0, totalValue: 0, deals: [] },
      qualification: { count: 0, totalValue: 0, deals: [] },
      proposal: { count: 0, totalValue: 0, deals: [] },
      negotiation: { count: 0, totalValue: 0, deals: [] },
      closed_won: { count: 0, totalValue: 0, deals: [] },
      closed_lost: { count: 0, totalValue: 0, deals: [] },
    };

    for (const d of allDeals) {
      const stage = d.stage || 'discovery';
      if (!pipeline[stage]) {
        pipeline[stage] = { count: 0, totalValue: 0, deals: [] };
      }
      pipeline[stage].count++;
      pipeline[stage].totalValue += parseFloat(d.value as string) || 0;
      pipeline[stage].deals.push(d);
    }

    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
};

// ─── Activities ────────────────────────────────────────

export const listActivities = async (req: Request, res: Response) => {
  try {
    const results = await db.select().from(activities)
      .where(eq(activities.tenantId, req.tenantId!))
      .orderBy(desc(activities.createdAt))
      .limit(100);
      
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list activities' });
  }
};

export const createActivity = async (req: Request, res: Response) => {
  try {
    const parsed = activitySchema.parse(req.body);
    const [activity] = await db.insert(activities).values({
      tenantId: req.tenantId!,
      userId: req.userId,
      contactId: parsed.contactId || null,
      dealId: parsed.dealId || null,
      type: parsed.type,
      subject: parsed.subject,
      body: parsed.body,
    }).returning();

    res.status(201).json(activity);
  } catch (err) {
    res.status(400).json({ error: 'Invalid activity data', details: err });
  }
};
