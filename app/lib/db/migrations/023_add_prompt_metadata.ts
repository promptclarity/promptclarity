import type Database from 'better-sqlite3';
import { Migration } from './migration-runner';

/**
 * Migration 023: Add prompt metadata columns
 * Adds funnel_stage, persona, tags, and topic_cluster columns to prompts table
 */
export const migration_023: Migration = {
  id: 23,
  name: 'add_prompt_metadata',

  up(db: Database.Database): void {
    // Add funnel_stage column for tracking where in the buyer journey this prompt fits
    db.exec(`ALTER TABLE prompts ADD COLUMN funnel_stage TEXT;`);

    // Add persona column for tracking target user persona
    db.exec(`ALTER TABLE prompts ADD COLUMN persona TEXT;`);

    // Add tags column for additional categorization (stored as JSON array)
    db.exec(`ALTER TABLE prompts ADD COLUMN tags TEXT;`);

    // Add topic_cluster column for grouping related prompts
    db.exec(`ALTER TABLE prompts ADD COLUMN topic_cluster TEXT;`);
  },

  down(db: Database.Database): void {
    // SQLite doesn't support DROP COLUMN in older versions
    // We need to recreate the table without the new columns
    db.exec(`
      CREATE TABLE prompts_backup AS
      SELECT id, business_id, topic_id, text, is_custom, priority, created_at, updated_at
      FROM prompts;
    `);
    db.exec(`DROP TABLE prompts;`);
    db.exec(`
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        topic_id INTEGER,
        text TEXT NOT NULL,
        is_custom INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
      );
    `);
    db.exec(`
      INSERT INTO prompts (id, business_id, topic_id, text, is_custom, priority, created_at, updated_at)
      SELECT id, business_id, topic_id, text, is_custom, priority, created_at, updated_at
      FROM prompts_backup;
    `);
    db.exec(`DROP TABLE prompts_backup;`);
  },
};
