import { Migration } from './migration-runner';

/**
 * Migration 012: Add Team Members and Invitations
 * Date: 2025-11-26
 * Description: Creates tables for managing team members and invitations per business
 */
export const migration_012: Migration = {
  id: 12,
  name: 'add_team_members',

  up: (db) => {
    db.exec(`
      -- Business members table (users who have access to a business)
      CREATE TABLE IF NOT EXISTS business_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        invited_by TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(business_id, user_id)
      );

      -- Invitations table for pending invites
      CREATE TABLE IF NOT EXISTS business_invitations (
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

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_business_members_business_id ON business_members(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_members_user_id ON business_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_business_invitations_business_id ON business_invitations(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_invitations_email ON business_invitations(email);
      CREATE INDEX IF NOT EXISTS idx_business_invitations_token ON business_invitations(token);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_business_invitations_token;
      DROP INDEX IF EXISTS idx_business_invitations_email;
      DROP INDEX IF EXISTS idx_business_invitations_business_id;
      DROP INDEX IF EXISTS idx_business_members_user_id;
      DROP INDEX IF EXISTS idx_business_members_business_id;
      DROP TABLE IF EXISTS business_invitations;
      DROP TABLE IF EXISTS business_members;
    `);
  }
};
