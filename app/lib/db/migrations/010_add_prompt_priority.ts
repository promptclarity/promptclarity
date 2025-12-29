import { Migration } from './migration-runner';

/**
 * Migration 010: Add priority flag to prompts
 * Date: 2025-11-25
 * Description: Adds is_priority column to prompts table for tracking priority prompts
 */
export const migration_010: Migration = {
  id: 10,
  name: 'add_prompt_priority',

  up: (db) => {
    db.exec(`
      ALTER TABLE prompts ADD COLUMN is_priority BOOLEAN DEFAULT 0;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    db.exec(`
      CREATE TABLE prompts_backup AS SELECT id, business_id, topic_id, text, is_custom, created_at FROM prompts;
      DROP TABLE prompts;
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        topic_id INTEGER,
        text TEXT NOT NULL,
        is_custom BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
      );
      INSERT INTO prompts SELECT * FROM prompts_backup;
      DROP TABLE prompts_backup;
    `);
  }
};
