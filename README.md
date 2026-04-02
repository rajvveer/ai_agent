# Business Copilot — Monolith Backend

This is the backend repository for the **Business Copilot** project. It is built using a modern Node.js and TypeScript stack, focusing on a single-process, single-codebase, single-deployment monolith architecture. 

It integrates Finance, CRM, Marketing, Hiring, Voice, and Reseller modules securely using PostgreSQL Row Level Security (RLS) under a multi-tenant model.

## 🚀 Architecture Overview

- **Architecture Style**: Monolith — one Node.js process, one codebase, one deploy
- **Runtime**: Node.js 20+ with TypeScript (`tsx` / `ts-node`)
- **Framework**: Express.js — single app instance
- **Database**: PostgreSQL 16 (Neon) with Drizzle ORM + Row Level Security
- **In-Process ML**: Python workers called via `child_process.spawn()`
- **Background Jobs**: BullMQ workers registered inside the same process
- **Scheduler**: `node-cron`
- **Authentication**: Clerk JWT with automated tenant provisioning
- **AI Core**: Agent ReAct Loop integrating Claude Sonnet (Primary) and Kimi K2 (Fallback)

## 📁 Repository Structure

```text
server/
├── index.ts                  # App entry point; starts Express + workers + scheduler
├── app.ts                    # Express config, middleware stack, route mounting
├── db/                       # Drizzle setup, schema definitions, and migrations
├── middleware/               # Auth, tenant RLS injector, rate limiter, cost tracker
├── modules/                  # Domains (agent, finance, crm, marketing, voice, reseller)
├── workers/                  # BullMQ processor registration and worker logic
├── scheduler/                # node-cron job registry
├── ml/                       # Python scripts (Prophet, scikit-learn) & spawn runner
├── lib/                      # Core clients (LLM, Redis, Pinecone, R2, etc.)
└── webhooks/                 # Event receivers (Stripe, Clerk, WhatsApp, Twilio)
```

## 🛠️ Getting Started

### Prerequisites

- **Node.js**: v20+
- **Python**: 3.11+ (for internal ML scripts)
- **PostgreSQL**: 16+ (Local or Neon)
- **Redis Server**: Local or Upstash

### 1. Installation

Clone the repository and install Node and Python dependencies.

```bash
# Install Node dependencies
npm install

# Install Python dependencies for ML modules
pip3 install -r server/ml/requirements.txt
```

### 2. Environment Variables

Copy the provided example environment file to create your own configuration:

```bash
cp .env.example .env
```

Ensure all keys are populated, especially:
- `DATABASE_URL` for PostgreSQL
- `REDIS_URL` for BullMQ & Caching
- `CLERK_SECRET_KEY` for Authentication
- `ANTHROPIC_API_KEY` for the AI Agent

### 3. Database Setup

Set up your database schema using Drizzle ORM. Row Level Security requires migrations to be applied properly.

```bash
# Generate SQL migrations from Drizzle schemas
npm run db:generate

# Apply pending Drizzle migrations
npm run db:migrate

# Alternatively, push schema directly to the database (for prototyping)
npm run db:push
```

### 4. Running the Application

Start the application in development mode:

```bash
npm run dev
```

For production deployment:

```bash
npm run build
npm run start
```

## 🧠 AI Agent Core

The agent uses a **ReAct loop** located in `server/modules/agent/`. It runs completely in-process. 
- Over 40+ direct memory function tools are registered across domains (Finance, CRM, Schedule, etc.).
- There are no HTTP hop limitations for internal tool executions. 
- Real-time SSE streaming yields output immediately.

## 🔐 Multi-Tenancy & Security

We enforce multi-tenancy strictly at the database level using PostgreSQL **Row Level Security (RLS)**.
- `app.current_tenant` is automatically injected by the `tenantMiddleware` per connection pool session.
- Database queries do not require manual application-level `WHERE tenant_id = ?` clauses.
- API requests are protected via Clerk JWT verification and a strict tenant ID resolution flow.

## ⚙️ Available Scripts

- `npm run dev`: Starts the server in watch mode using `tsx`.
- `npm run start`: Runs the server post-build.
- `npm run build`: Compiles the TypeScript codebase.
- `npm run db:generate`: Generates SQL migrations.
- `npm run db:migrate`: Applies SQL migrations.
- `npm run db:push`: Pushes schema directly.
- `npm run db:studio`: Opens Drizzle Studio for visual database inspection.

## 🚢 Deployment

The entire backend requires only one deployable unit and one `Dockerfile`. 
Recommended infrastructure:
- **Compute**: Railway, Render, or Fly.io
- **Database**: Neon (Serverless Postgres)
- **Redis**: Upstash
- **Storage**: Cloudflare R2
```
