import { Migration } from './migration-runner';
import Database from 'better-sqlite3';

export const migration_021: Migration = {
  id: 21,
  name: 'add_instance_settings',

  up(db: Database.Database): void {
    // Create instance_settings table for tracking instance configuration
    db.exec(`
      CREATE TABLE IF NOT EXISTS instance_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        initialized BOOLEAN NOT NULL DEFAULT 0,
        initialized_at DATETIME,
        owner_user_id TEXT,
        deployment_mode TEXT NOT NULL DEFAULT 'self-hosted',
        instance_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id)
      );

      -- Insert default row (uninitialized)
      INSERT OR IGNORE INTO instance_settings (id, initialized, deployment_mode)
      VALUES (1, 0, 'self-hosted');
    `);
  },

  down(db: Database.Database): void {
    db.exec(`DROP TABLE IF EXISTS instance_settings;`);
  },
};
