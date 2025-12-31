import { Migration } from './migration-runner';

/**
 * Migration 008: Add Business Strategy Table
 * Date: 2025-11-26
 * Description: Adds table to store business strategy for AI search optimization
 */
export const migration_008: Migration = {
  id: 8,
  name: 'add_business_strategy',

  up: (db) => {
    db.exec(`
      -- Business strategy table
      CREATE TABLE IF NOT EXISTS business_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL UNIQUE,
        primary_goal TEXT NOT NULL DEFAULT 'visibility',
        product_segments TEXT DEFAULT '[]',
        target_markets TEXT DEFAULT '[]',
        target_personas TEXT DEFAULT '[]',
        funnel_stages TEXT DEFAULT '["awareness","consideration","decision"]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      -- Index for quick lookup
      CREATE INDEX IF NOT EXISTS idx_business_strategies_business ON business_strategies(business_id);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS business_strategies;
    `);
  }
};
