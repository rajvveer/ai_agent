import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core.js';

// ─── Agent Conversations ───────────────────────────────
export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 500 }),
  channel: varchar('channel', { length: 50 }).notNull().default('web'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Agent Messages ────────────────────────────────────
export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => agentConversations.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  toolResults: jsonb('tool_results'),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Agent Actions Log (Immutable Audit Trail) ─────────
export const agentActionsLog = pgTable('agent_actions_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  userId: uuid('user_id').references(() => users.id),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  moduleName: varchar('module_name', { length: 100 }),
  payload: jsonb('payload'),
  outcome: jsonb('outcome'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Vector Memories ───────────────────────────────────
export const vectorMemories = pgTable('vector_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  embeddingId: varchar('embedding_id', { length: 255 }).notNull(),
  content: text('content').notNull(),
  source: varchar('source', { length: 100 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Scheduled Tasks ──────────────────────────────────
export const scheduledTasks = pgTable('scheduled_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  taskType: varchar('task_type', { length: 100 }).notNull(),
  cronExpr: varchar('cron_expr', { length: 100 }).notNull(),
  params: jsonb('params'),
  active: boolean('active').default(true).notNull(),
  lastRun: timestamp('last_run', { withTimezone: true }),
  nextRun: timestamp('next_run', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── LLM Usage Log ────────────────────────────────────
export const llmUsageLog = pgTable('llm_usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  userId: uuid('user_id').references(() => users.id),
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
  toolName: varchar('tool_name', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
