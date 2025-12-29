import { Migration } from './migration-runner';

/**
 * Migration 005: Add Platform Budget Limits
 * Date: 2025-11-24
 * Description: Adds budget_limit column to business_platforms for credit tracking
 */
export const migration_005: Migration = {
  id: 5,
  name: 'add_platform_budget',

  up: (db) => {
    db.exec(`
      -- Add budget limit column to business_platforms
      -- NULL means no limit set, user can set their credit balance/budget
      ALTER TABLE business_platforms ADD COLUMN budget_limit_usd REAL DEFAULT NULL;

      -- Add warning threshold percentage (default 80% - warn when 80% of budget used)
      ALTER TABLE business_platforms ADD COLUMN warning_threshold_percent INTEGER DEFAULT 80;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily
    db.exec(`
      -- Note: Cannot easily drop columns in SQLite
    `);
  }
};
