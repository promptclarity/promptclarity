import { Migration } from './migration-runner';

/**
 * Migration 007: Add Detailed API Call Tracking
 * Date: 2025-11-25
 * Description: Adds table to track individual API calls with call types for cost analysis
 */
export const migration_007: Migration = {
  id: 7,
  name: 'add_api_call_tracking',

  up: (db) => {
    db.exec(`
      -- Detailed API call tracking table
      CREATE TABLE IF NOT EXISTS api_call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        platform_id INTEGER NOT NULL,
        execution_id INTEGER,
        call_type TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0,
        duration_ms INTEGER,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (platform_id) REFERENCES business_platforms(id) ON DELETE CASCADE,
        FOREIGN KEY (execution_id) REFERENCES prompt_executions(id) ON DELETE SET NULL
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_api_call_logs_business ON api_call_logs(business_id);
      CREATE INDEX IF NOT EXISTS idx_api_call_logs_platform ON api_call_logs(platform_id);
      CREATE INDEX IF NOT EXISTS idx_api_call_logs_execution ON api_call_logs(execution_id);
      CREATE INDEX IF NOT EXISTS idx_api_call_logs_call_type ON api_call_logs(call_type);
      CREATE INDEX IF NOT EXISTS idx_api_call_logs_created ON api_call_logs(created_at);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS api_call_logs;
    `);
  }
};
