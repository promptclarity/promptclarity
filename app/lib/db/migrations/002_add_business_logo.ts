import { Migration } from './migration-runner';

/**
 * Migration 002: Add Business Logo
 * Date: 2025-11-21
 * Description: Adds logo_url field to businesses table to store brand logos
 */
export const migration_002: Migration = {
  id: 2,
  name: 'add_business_logo',

  up: (db) => {
    db.exec(`
      -- Add logo_url column to businesses table
      ALTER TABLE businesses ADD COLUMN logo_url TEXT;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily
    // Would need to recreate table without logo_url column
    console.warn('Rollback for migration 002 not implemented - requires table recreation');
  }
};
