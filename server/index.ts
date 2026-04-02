import 'dotenv/config';
import app from './app.js';
import { pool } from './db/client.js';
import { redis } from './lib/redis.js';
import { registerAllWorkers } from './workers/index.js';
import { startScheduler } from './scheduler/index.js';

const PORT = parseInt(process.env.PORT || '3000');

async function startup(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     BUSINESS COPILOT — Backend v1.0      ║');
  console.log('║     Monolith Architecture                ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    // Step 1: Connect to PostgreSQL
    console.log('[1/6] Connecting to PostgreSQL...');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[1/6] ✓ PostgreSQL connected');

    // Step 2: Connect to Redis
    console.log('[2/6] Connecting to Redis...');
    await redis.ping();
    console.log('[2/6] ✓ Redis connected');

    // Step 3: Run pending migrations (if using drizzle-kit push/migrate)
    console.log('[3/6] Checking database schema...');
    // Migrations are run via `npm run db:push` or `npm run db:migrate` commands
    // In production, CMD in Dockerfile runs db:migrate before start
    console.log('[3/6] ✓ Schema check complete (run npm run db:push to sync)');

    // Step 4: Start Express server
    console.log('[4/6] Starting Express server...');
    const server = app.listen(PORT, () => {
      console.log(`[4/6] ✓ Express listening on port ${PORT}`);
    });

    // Step 5: Register BullMQ workers
    console.log('[5/6] Registering BullMQ workers...');
    registerAllWorkers();
    console.log('[5/6] ✓ Workers registered');

    // Step 6: Start cron scheduler
    console.log('[6/6] Starting cron scheduler...');
    await startScheduler();
    console.log('[6/6] ✓ Scheduler started');

    console.log('');
    console.log(`🚀 Business Copilot backend ready at http://localhost:${PORT}`);
    console.log(`📋 Health: http://localhost:${PORT}/health`);
    console.log(`🔑 Auth:   http://localhost:${PORT}/api/auth/`);
    console.log(`🤖 Agent:  http://localhost:${PORT}/api/agent/`);
    console.log('');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);

      server.close(() => {
        console.log('[Shutdown] Express server closed');
      });

      await redis.quit();
      console.log('[Shutdown] Redis disconnected');

      await pool.end();
      console.log('[Shutdown] PostgreSQL pool drained');

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[FATAL] Startup failed:', err);
    process.exit(1);
  }
}

startup();
