import { Migration } from './migration-runner';

/**
 * Migration 017: Remove user_id from businesses
 * Date: 2025-12-07
 * Description: Removes the user_id column from businesses table.
 *              User-business relationships are now managed exclusively through business_members table.
 */
export const migration_017: Migration = {
  id: 17,
  name: 'remove_business_user_id',

  up: (db) => {
    // SQLite doesn't support DROP COLUMN in older versions, so we recreate the table
    db.exec(`
      -- Drop the index first
      DROP INDEX IF EXISTS idx_businesses_user_id;

      -- Create new table without user_id
      CREATE TABLE businesses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        website TEXT NOT NULL,
        logo TEXT,
        next_execution_time DATETIME,
        refresh_period_days INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data (excluding user_id)
      INSERT INTO businesses_new (id, business_name, website, logo, next_execution_time, refresh_period_days, created_at, updated_at)
      SELECT id, business_name, website, logo, next_execution_time, refresh_period_days, created_at, updated_at
      FROM businesses;

      -- Drop old table
      DROP TABLE businesses;

      -- Rename new table
      ALTER TABLE businesses_new RENAME TO businesses;

      -- Recreate the next_execution index
      CREATE INDEX IF NOT EXISTS idx_businesses_next_execution ON businesses(next_execution_time);
    `);
  },

  down: (db) => {
    // Add user_id column back
    db.exec(`
      ALTER TABLE businesses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
    `);
  }
};