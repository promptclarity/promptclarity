/**
 * Internal Cron Scheduler for Prompt Executions
 *
 * Uses node-cron to check every 5 minutes if any businesses are due for execution.
 * This runs within the Next.js server process.
 *
 * Server restart handling:
 * - Each business has a `next_execution_time` stored in the database
 * - Execution only happens when `next_execution_time <= now`
 * - After execution, `next_execution_time` is set to `now + refresh_period_days`
 * - If the server restarts, pending executions will run on the next check
 * - Already-executed businesses won't re-run because their `next_execution_time` is in the future
 */

import cron from 'node-cron';
import { dbHelpers } from './db/database';
import { promptExecutionService } from './services/prompt-execution.service';

let isSchedulerRunning = false;

interface BusinessSchedule {
  id: number;
  business_name: string;
  next_execution_time: string | null;
  refresh_period_days: number;
}

async function executeBusinessPrompts(business: BusinessSchedule) {
  console.log(`[Scheduler] Executing prompts for business: ${business.business_name}`);

  try {
    const executionResults = await promptExecutionService.executeAllPrompts(business.id);

    // Update next_execution_time based on refresh_period_days
    const refreshPeriodMs = (business.refresh_period_days || 1) * 24 * 60 * 60 * 1000;
    const nextExecutionTime = new Date(Date.now() + refreshPeriodMs).toISOString();

    dbHelpers.setBusinessNextExecution.run({
      businessId: business.id,
      nextExecutionTime
    });

    console.log(`[Scheduler] Completed ${executionResults.length} prompts for ${business.business_name}. Next execution: ${nextExecutionTime}`);
    return { success: true, promptsExecuted: executionResults.length };
  } catch (error: any) {
    console.error(`[Scheduler] Error executing prompts for business ${business.id}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function checkAndExecute() {
  try {
    const businessesDue = dbHelpers.getBusinessesDueForExecution.all() as BusinessSchedule[];

    if (businessesDue.length === 0) {
      return;
    }

    console.log(`[Scheduler] Found ${businessesDue.length} business(es) due for execution`);

    for (const business of businessesDue) {
      await executeBusinessPrompts(business);
    }
  } catch (error: any) {
    console.error('[Scheduler] Error checking for due executions:', error.message);
  }
}

export function startScheduler() {
  if (isSchedulerRunning) {
    console.log('[Scheduler] Already running, skipping initialization');
    return;
  }

  // Check every 5 minutes for businesses due for execution
  const schedule = process.env.CRON_SCHEDULE || '*/5 * * * *';

  if (!cron.validate(schedule)) {
    console.error('[Scheduler] Invalid cron schedule:', schedule);
    return;
  }

  console.log(`[Scheduler] Starting with schedule: ${schedule}`);

  cron.schedule(schedule, () => {
    checkAndExecute();
  });

  isSchedulerRunning = true;
  console.log('[Scheduler] Started successfully');

  // Run an initial check after a short delay to catch any missed executions
  setTimeout(() => {
    console.log('[Scheduler] Running initial check...');
    checkAndExecute();
  }, 10000); // 10 second delay to let the app fully initialize
}

export function stopScheduler() {
  // node-cron doesn't expose a direct way to stop all tasks
  // This is mainly for testing purposes
  isSchedulerRunning = false;
  console.log('[Scheduler] Stopped');
}