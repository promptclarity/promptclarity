import { Migration } from './migration-runner';
import Database from 'better-sqlite3';

export const migration_020: Migration = {
  id: 20,
  name: 'add_invitation_name',

  up(db: Database.Database): void {
    // Add name column to business_invitations
    db.exec(`
      ALTER TABLE business_invitations ADD COLUMN name TEXT;
    `);
  },

  down(db: Database.Database): void {
    // SQLite doesn't support DROP COLUMN directly
    // Would need to recreate the table
  },
};
