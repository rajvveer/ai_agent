import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bankAccounts, transactions, invoices } from '../../db/schema/finance.js';
import { plaidClient } from '../../lib/plaid.js';
import { CountryCode, Products } from 'plaid';
import { z } from 'zod';

export const createLinkToken = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: tenantId },
      client_name: 'Business Copilot',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error creating Plaid link token:', error?.response?.data || error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
};

export const exchangePublicToken = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const { publicToken } = req.body;
    if (!publicToken) return res.status(400).json({ error: 'Missing public token' });

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    
    // In a real application, fetch accounts and store them.
    // For now we'll do a basic save
    const accountsResponse = await plaidClient.accountsGet({
      access_token: response.data.access_token,
    });

    const accounts = accountsResponse.data.accounts;
    const insertedAccounts = [];
    
    for (const acc of accounts) {
      const [inserted] = await db.insert(bankAccounts).values({
        tenantId,
        plaidItemId: response.data.item_id + '_' + acc.account_id,
        plaidAccessToken: response.data.access_token,
        name: acc.name,
        mask: acc.mask || '',
        subtype: acc.subtype || '',
      }).returning();
      insertedAccounts.push(inserted);
    }

    res.json({ success: true, item_id: response.data.item_id, accounts: insertedAccounts });
  } catch (error: any) {
    console.error('Error exchanging public token:', error?.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
};

// Simple invoice schema
const invoiceSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  amount: z.number().positive(),
  dueDate: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).default('draft'),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    price: z.number(),
  })).default([]),
});

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = parseInt(req.query.limit as string) || 50;

    const items = await db.select().from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .limit(limit);

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = invoiceSchema.parse(req.body);

    const [invoice] = await db.insert(invoices).values({
      tenantId,
      customerName: parsed.customerName,
      customerEmail: parsed.customerEmail,
      amount: parsed.amount.toString(),
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      status: parsed.status,
      items: parsed.items,
    }).returning();

    res.status(201).json(invoice);
  } catch (error) {
    res.status(400).json({ error: 'Invalid invoice data', details: error });
  }
};

export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const invoiceId = req.params.id as string;

    // A simplified update for Phase 3
    const parsed = invoiceSchema.partial().parse(req.body);
    
    // Verify invoice exists & belongs to tenant
    const existing = await db.select().from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);
    
    if (existing.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const toUpdate: any = { updatedAt: new Date() };
    if (parsed.customerName !== undefined) toUpdate.customerName = parsed.customerName;
    if (parsed.status !== undefined) toUpdate.status = parsed.status;
    if (parsed.amount !== undefined) toUpdate.amount = parsed.amount.toString();
    if (parsed.items !== undefined) toUpdate.items = parsed.items;

    const [updated] = await db.update(invoices)
      .set(toUpdate)
      .where(eq(invoices.id, invoiceId))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update invoice' });
  }
};

export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const invoiceId = req.params.id as string;

    const [deleted] = await db.delete(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Invoice not found' });

    res.json({ message: 'Invoice deleted', id: deleted.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

// Cash flow endpoint (simplified mock using DB transactions if available)
export const getCashFlow = async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    // In a real scenario, this would aggregate `transactions` table using sum(amount) group by date/category
    // For Phase 3, we fetch the transactions and aggregate in memory for simplicity or just return dummy data if empty.
    
    const accountTxns = await db.select().from(transactions).where(eq(transactions.tenantId, tenantId)).limit(100);
    
    if (accountTxns.length === 0) {
      // Mock data for UI if no real ones
      return res.json({
        summary: {
          totalInflow: "15000.00",
          totalOutflow: "8200.00",
          netCashFlow: "6800.00"
        },
        recentTransactions: []
      });
    }

    let inflow = 0;
    let outflow = 0;

    for (const t of accountTxns) {
      const amt = parseFloat(t.amount as string);
      // Plaid treats positive amounts as money removed from the account (purchases/outflow)
      // and negative amounts as money added to the account (refunds/deposits/inflow)
      if (amt < 0) {
        inflow += Math.abs(amt);
      } else {
        outflow += amt;
      }
    }

    res.json({
      summary: {
        totalInflow: inflow.toFixed(2),
        totalOutflow: outflow.toFixed(2),
        netCashFlow: (inflow - outflow).toFixed(2),
      },
      recentTransactions: accountTxns,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute cash flow' });
  }
};
