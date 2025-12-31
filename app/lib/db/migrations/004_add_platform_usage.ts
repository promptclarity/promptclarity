import { Migration } from './migration-runner';

/**
 * Migration 004: Add Platform Usage Tracking
 * Date: 2025-11-24
 * Description: Adds tables to track API usage per platform
 */
export const migration_004: Migration = {
  id: 4,
  name: 'add_platform_usage',

  up: (db) => {
    db.exec(`
      -- Platform usage tracking table
      CREATE TABLE IF NOT EXISTS platform_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        platform_id INTEGER NOT NULL,
        date DATE NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (platform_id) REFERENCES business_platforms(id) ON DELETE CASCADE,
        UNIQUE(business_id, platform_id, date)
      );

      -- Add token usage columns to prompt_executions for per-request tracking
      ALTER TABLE prompt_executions ADD COLUMN prompt_tokens INTEGER DEFAULT 0;
      ALTER TABLE prompt_executions ADD COLUMN completion_tokens INTEGER DEFAULT 0;
      ALTER TABLE prompt_executions ADD COLUMN total_tokens INTEGER DEFAULT 0;

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_platform_usage_business ON platform_usage(business_id);
      CREATE INDEX IF NOT EXISTS idx_platform_usage_platform ON platform_usage(platform_id);
      CREATE INDEX IF NOT EXISTS idx_platform_usage_date ON platform_usage(date);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS platform_usage;
      -- Note: SQLite doesn't support DROP COLUMN easily, so we leave the columns
    `);
  }
};
