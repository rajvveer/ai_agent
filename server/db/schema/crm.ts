import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  jsonb,
  text,
  boolean,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core.js';

// ─── Contacts ──────────────────────────────────────────
export const contacts = pgTable('contacts', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').references(() => tenants.id).notNull(),
  name:       varchar('name', { length: 255 }).notNull(),
  email:      varchar('email', { length: 255 }),
  phone:      varchar('phone', { length: 50 }),
  company:    varchar('company', { length: 255 }),
  type:       varchar('type', { length: 20 }).notNull().default('lead'), // lead | client
  source:     varchar('source', { length: 100 }),  // web, referral, whatsapp, cold-call
  tags:       jsonb('tags').default([]),
  metadata:   jsonb('metadata').default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Deals ─────────────────────────────────────────────
export const deals = pgTable('deals', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').references(() => tenants.id).notNull(),
  contactId:  uuid('contact_id').references(() => contacts.id),
  title:      varchar('title', { length: 255 }).notNull(),
  value:      numeric('value', { precision: 12, scale: 2 }).default('0'),
  currency:   varchar('currency', { length: 3 }).default('USD'),
  stage:      varchar('stage', { length: 50 }).notNull().default('discovery'),
             // discovery → qualification → proposal → negotiation → closed_won | closed_lost
  priority:   varchar('priority', { length: 20 }).default('medium'), // low | medium | high
  expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
  closedAt:   timestamp('closed_at', { withTimezone: true }),
  assignedTo: uuid('assigned_to').references(() => users.id),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Activities ────────────────────────────────────────
export const activities = pgTable('activities', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').references(() => tenants.id).notNull(),
  contactId:  uuid('contact_id').references(() => contacts.id),
  dealId:     uuid('deal_id').references(() => deals.id),
  userId:     uuid('user_id').references(() => users.id),
  type:       varchar('type', { length: 50 }).notNull(),
             // note | call | email | meeting | whatsapp | task | stage_change
  subject:    varchar('subject', { length: 500 }),
  body:       text('body'),
  metadata:   jsonb('metadata').default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── WhatsApp Configuration ────────────────────────────
export const whatsappConfig = pgTable('whatsapp_config', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').references(() => tenants.id).notNull(),
  phoneNumber:    varchar('phone_number', { length: 20 }).notNull().unique(),
  provider:       varchar('provider', { length: 20 }).notNull().default('360dialog'),
  apiKey:         varchar('api_key', { length: 500 }),  // encrypted in production
  phoneNumberId:  varchar('phone_number_id', { length: 100 }),
  active:         boolean('active').default(true).notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
