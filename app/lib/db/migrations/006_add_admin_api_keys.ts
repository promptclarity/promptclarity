import { Migration } from './migration-runner';

/**
 * Migration: Add admin API key field for fetching real billing data
 */
export const migration_006: Migration = {
  id: 6,
  name: 'add_admin_api_keys',
  up: (db) => {
    // Add admin_api_key column to business_platforms
    db.exec(`
      ALTER TABLE business_platforms ADD COLUMN admin_api_key TEXT;
    `);
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
    // For simplicity, we'll leave this as a no-op
  }
};
