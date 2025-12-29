import { Migration } from './migration-runner';

/**
 * Migration 016: Add Refresh Period
 * Date: 2025-12-06
 * Description: Adds refresh_period_days column to businesses table.
 *              Allows configuring how often prompts should be executed (1-7 days).
 *              Default is 1 (daily).
 */
export const migration_016: Migration = {
  id: 16,
  name: 'add_refresh_period',

  up: (db) => {
    // Add refresh_period_days column with default of 1 (daily)
    db.exec(`
      ALTER TABLE businesses ADD COLUMN refresh_period_days INTEGER NOT NULL DEFAULT 1;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly
    // For simplicity, leaving column in place during rollback
  }
};