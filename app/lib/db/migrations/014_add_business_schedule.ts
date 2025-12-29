import { Migration } from './migration-runner';

/**
 * Migration 014: Add Business Schedule
 * Date: 2025-12-03
 * Description: Adds next_execution_time column to businesses table for per-business scheduling.
 *              Each business will have its own execution schedule based on when it was created.
 *              Prompts execute immediately on onboarding completion, then at the same time every 24 hours.
 */
export const migration_014: Migration = {
  id: 14,
  name: 'add_business_schedule',

  up: (db) => {
    // Add next_execution_time column to track when prompts should next execute
    // This is set when onboarding completes, then updated after each execution
    db.exec(`
      ALTER TABLE businesses ADD COLUMN next_execution_time DATETIME;
    `);

    // Create index for efficient querying of businesses due for execution
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_businesses_next_execution ON businesses(next_execution_time);
    `);

    // For existing businesses, set next_execution_time to NULL (they'll use the legacy daily cron)
    // New businesses will have this set when onboarding completes
  },

  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_businesses_next_execution;
    `);
    // SQLite doesn't support DROP COLUMN directly, would need to recreate table
    // For simplicity, leaving column in place during rollback
  }
};
