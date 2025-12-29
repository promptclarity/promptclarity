import { Migration } from './migration-runner';

/**
 * Migration 003: Rename logo_url to logo
 * Date: 2025-11-23
 * Description: Renames logo_url column to logo in businesses table
 */
export const migration_003: Migration = {
  id: 3,
  name: 'rename_logo_url_to_logo',

  up: (db) => {
    // SQLite doesn't support RENAME COLUMN directly in older versions
    // We need to recreate the table
    db.exec(`
      -- Create new businesses table with logo column
      CREATE TABLE businesses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        website TEXT NOT NULL,
        logo TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy data from old table
      INSERT INTO businesses_new (id, business_name, website, logo, created_at, updated_at)
      SELECT id, business_name, website, logo_url, created_at, updated_at
      FROM businesses;

      -- Drop old table
      DROP TABLE businesses;

      -- Rename new table to original name
      ALTER TABLE businesses_new RENAME TO businesses;
    `);
  },

  down: (db) => {
    // Reverse migration - rename logo back to logo_url
    db.exec(`
      CREATE TABLE businesses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        website TEXT NOT NULL,
        logo_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO businesses_new (id, business_name, website, logo_url, created_at, updated_at)
      SELECT id, business_name, website, logo, created_at, updated_at
      FROM businesses;

      DROP TABLE businesses;

      ALTER TABLE businesses_new RENAME TO businesses;
    `);
  }
};