import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  jsonb,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { tenants } from './core.js';

export const cashflowForecasts = pgTable('cashflow_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  periodDays: integer('period_days').notNull(), // 30, 60, 90
  forecast: jsonb('forecast').notNull(),        // Array of {ds, yhat, yhat_lower, yhat_upper}
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Bank Accounts ─────────────────────────────────────
export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  plaidItemId: varchar('plaid_item_id', { length: 255 }).unique(),
  plaidAccessToken: varchar('plaid_access_token', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  mask: varchar('mask', { length: 10 }),
  subtype: varchar('subtype', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Transactions ──────────────────────────────────────
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id).notNull(),
  plaidTransactionId: varchar('plaid_transaction_id', { length: 255 }).unique(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  category: jsonb('category').default([]), // Array of categories from Plaid
  pending: boolean('pending').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Invoices ──────────────────────────────────────────
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('draft'), // draft | sent | paid | overdue
  issueDate: timestamp('issue_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  items: jsonb('items').default([]).notNull(), // Array of invoice items { description, quantity, price }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
