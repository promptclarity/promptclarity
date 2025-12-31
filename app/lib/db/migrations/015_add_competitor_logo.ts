import { Migration } from './migration-runner';

export const migration_015: Migration = {
  id: 15,
  name: 'add_competitor_logo',
  up: (db) => {
    // Add logo column to competitors table
    db.exec(`ALTER TABLE competitors ADD COLUMN logo TEXT;`);
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, would need to recreate table
    console.log('Migration 015 down: logo column removal not implemented');
  }
};
