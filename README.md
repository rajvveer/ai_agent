# Business Copilot — Backend

The monolith backend powering **Business Copilot** — an AI-driven platform for Finance, CRM, Marketing, Hiring, Voice, and Reseller operations. Built for multi-tenant enterprise use with a single process, single codebase, single deployment philosophy.

---

## Architecture Overview

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ · TypeScript (`tsx`) |
| Framework | Express.js |
| Database | PostgreSQL 16 (Neon) · Drizzle ORM · RLS |
| Auth | Clerk JWT + automated tenant provisioning |
| AI Core | ReAct loop · Claude Sonnet (primary) · Kimi K2 (fallback) |
| Background Jobs | BullMQ (in-process workers) |
| Scheduler | `node-cron` |
| ML | Python 3.11+ scripts via `child_process.spawn()` |

Everything runs in a single Node.js process — no service mesh, no inter-service HTTP calls, no distributed overhead.

---

## Repository Structure

```text
server/
├── index.ts          # Entry point — starts Express, workers, and scheduler
├── app.ts            # Express config, middleware stack, route mounting
├── db/               # Drizzle schema definitions, migrations, and client setup
├── middleware/       # Auth, tenant RLS injector, rate limiter, cost tracker
├── modules/          # Domain logic (agent, finance, crm, marketing, voice, reseller)
├── workers/          # BullMQ processor registration and job handlers
├── scheduler/        # node-cron job registry
├── ml/               # Python ML scripts (Prophet, scikit-learn) + spawn runner
├── lib/              # Core clients — LLM, Redis, Pinecone, Cloudflare R2
└── webhooks/         # Inbound event handlers — Stripe, Clerk, WhatsApp, Twilio
```

---

## Getting Started

### Prerequisites

- **Node.js** v20+
- **Python** 3.11+ *(for ML modules)*
- **PostgreSQL** 16+ *(local or [Neon](https://neon.tech))*
- **Redis** *(local or [Upstash](https://upstash.com))*

### 1. Install Dependencies

```bash
# Node dependencies
npm install

# Python dependencies for ML modules
pip3 install -r server/ml/requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Populate all required keys — the critical ones are:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon / PostgreSQL connection string |
| `REDIS_URL` | BullMQ queue and caching layer |
| `CLERK_SECRET_KEY` | JWT verification and tenant provisioning |
| `ANTHROPIC_API_KEY` | Claude Sonnet for the AI agent core |

### 3. Set Up the Database

Drizzle ORM manages all schema and migrations. RLS policies are applied as part of the migration process.

```bash
# Generate SQL migrations from your Drizzle schema
npm run db:generate

# Apply all pending migrations
npm run db:migrate
```

> **Prototyping only:** Use `npm run db:push` to push schema changes directly without generating migration files.

### 4. Start the Server

```bash
# Development (watch mode)
npm run dev

# Production
npm run build && npm run start
```

---

## AI Agent Core

The agent lives in `server/modules/agent/` and runs a **ReAct (Reason + Act) loop** entirely in-process.

- **40+ registered tools** spanning Finance, CRM, Scheduling, and more
- **No HTTP hop overhead** — all tool calls are direct in-memory function calls
- **Real-time output** via Server-Sent Events (SSE) streaming
- **Automatic fallback** — switches from Claude Sonnet to Kimi K2 on failure or rate limits

---

## Multi-Tenancy & Security

Tenant isolation is enforced at the **database level** using PostgreSQL Row Level Security (RLS) — not at the application layer.

- `tenantMiddleware` automatically injects `app.current_tenant` into each connection pool session
- All queries are automatically scoped to the active tenant — no manual `WHERE tenant_id = ?` needed
- Every API request is gated by Clerk JWT verification before the tenant ID is resolved

This means a misconfigured query cannot leak cross-tenant data by design.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start server in watch mode using `tsx` |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start` | Run the compiled production server |
| `npm run db:generate` | Generate SQL migration files from schema |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:push` | Push schema directly (prototyping only) |
| `npm run db:studio` | Open Drizzle Studio for visual DB inspection |

---

## Deployment

The entire backend ships as **one deployable unit** with a single `Dockerfile`.

| Service | Recommended Provider |
|---|---|
| Compute | [Railway](https://railway.app) · [Render](https://render.com) · [Fly.io](https://fly.io) |
| Database | [Neon](https://neon.tech) — Serverless Postgres |
| Redis | [Upstash](https://upstash.com) — Serverless Redis |
| File Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
