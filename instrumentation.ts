/**
 * Next.js Instrumentation - Server Startup Hook
 *
 * This file runs when the Next.js server starts. We use it to initialize
 * the internal cron scheduler for prompt executions.
 *
 * Note: This works for development and self-hosted deployments.
 * For Vercel serverless, the cron is triggered via vercel.json config.
 */

export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./app/lib/scheduler');
    startScheduler();
  }
}