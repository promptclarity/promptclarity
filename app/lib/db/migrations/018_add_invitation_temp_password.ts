import { Migration } from './migration-runner';

/**
 * Migration 018: Add temp_password to business_invitations
 * Date: 2025-12-07
 * Description: Adds a temporary password field to invitations so invited users
 *              can sign in with their email and the temp password.
 */
export const migration_018: Migration = {
  id: 18,
  name: 'add_invitation_temp_password',

  up: (db) => {
    db.exec(`
      ALTER TABLE business_invitations ADD COLUMN temp_password TEXT;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily, so we recreate
    db.exec(`
      CREATE TABLE business_invitations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        token TEXT UNIQUE NOT NULL,
        invited_by TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(business_id, email, accepted_at)
      );

      INSERT INTO business_invitations_new (id, business_id, email, role, token, invited_by, expires_at, accepted_at, created_at)
      SELECT id, business_id, email, role, token, invited_by, expires_at, accepted_at, created_at
      FROM business_invitations;

      DROP TABLE business_invitations;
      ALTER TABLE business_invitations_new RENAME TO business_invitations;

      CREATE INDEX idx_business_invitations_business_id ON business_invitations(business_id);
      CREATE INDEX idx_business_invitations_email ON business_invitations(email);
      CREATE INDEX idx_business_invitations_token ON business_invitations(token);
    `);
  }
};
