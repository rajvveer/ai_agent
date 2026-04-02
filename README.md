# Business Copilot — Monolith Backend

This is the backend repository for the Business Copilot project. It is built using a modern Node.js and TypeScript stack, focusing on performance, scalability, and robust AI integrations.

## Tech Stack

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Caching & Queues**: Redis & BullMQ
- **Authentication**: JWT, bcrypt, otplib (for 2FA/OTP), Google Auth Library
- **AI Integration**: OpenAI SDK (compatible with any LLM conforming to the spec)
- **Validation**: Zod
- **Scheduling**: node-cron

## Key Features

- **Authentication System**: Includes OTP verification, 2FA, and Google OAuth flow.
- **Agent System**: Integrates LLMs equipped with custom tool registries.
- **Task Scheduling & Queues**: Uses BullMQ for asynchronous background processing and `node-cron` for scheduled tasks.
- **Rate Limiting & Cost Checking**: Middlewares configured via Redis to handle rate limiting and LLM cost monitoring per tenant.
- **Docker Ready**: Pre-configured `Dockerfile`.

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- Node.js (v18+ recommended)
- PostgreSQL
- Redis Server (Running on default port `6379`)

### 1. Installation

Clone the repo and install dependencies:

```bash
npm install
```

### 2. Environment Variables

Copy the provided example environment file to create your own configuration:

```bash
cp .env.example .env
```
Ensure you fill in all the required fields in `.env`, particularly your `DATABASE_URL` and `REDIS_URL`.

### 3. Database Setup

Set up your database schema using Drizzle:

```bash
# Push schema directly to the database
npm run db:push

# Optionally, you can generate and run migrations
npm run db:generate
npm run db:migrate
```

### 4. Running the Dev Server

Start the application in development mode:

```bash
npm run dev
```

## Available Scripts

- `npm run dev`: Starts the server in watch mode using `tsx`.
- `npm run start`: Runs the server (ideal for production usage after building).
- `npm run build`: Compiles the typescript code to JavaScript using `tsc`.
- `npm run db:generate`: Generates SQL migrations from Drizzle schemas.
- `npm run db:migrate`: Applies pending Drizzle migrations.
- `npm run db:push`: Pushes schema changes directly to the database.
- `npm run db:studio`: Opens Drizzle Studio to interact with your data in the browser.

## Project Structure

- `server/db/`: Contains Drizzle configuration, schema files, and the database client.
- `server/lib/`: Reusable utilities (JWT handling, Redis configuration, LLM setups).
- `server/middleware/`: Express middlewares (Auth, Error handling, Cost-tracker, Rate-limiter).
- `server/modules/`: Main application features encapsulated in modules (Auth, Agents).
- `server/workers/`: BullMQ worker definitions for background jobs.
- `server/webhooks/`: Webhook receivers.
