import { Migration } from './migration-runner';

/**
 * Migration 019: Add must_change_password to users
 * Date: 2025-12-07
 * Description: Adds a flag to track if user needs to change their password
 *              (e.g., after accepting an invite with a temp password)
 */
export const migration_019: Migration = {
  id: 19,
  name: 'add_user_must_change_password',

  up: (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily, so we recreate
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        email_verified DATETIME,
        image TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users_new (id, name, email, email_verified, image, password, created_at, updated_at)
      SELECT id, name, email, email_verified, image, password, created_at, updated_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  }
};
