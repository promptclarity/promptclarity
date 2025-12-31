import { Migration } from './migration-runner';

export const migration013AddCompetitorActiveFlag: Migration = {
  id: 13,
  name: 'add_competitor_active_flag',
  up: (db) => {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(competitors)").all() as Array<{ name: string }>;
    const hasColumn = tableInfo.some(col => col.name === 'is_active');

    if (!hasColumn) {
      // Add is_active column to competitors table (default to true/1)
      db.exec(`
        ALTER TABLE competitors ADD COLUMN is_active INTEGER DEFAULT 1;
      `);
    }
  },
  down: (db) => {
    // SQLite doesn't support dropping columns easily, so we'd need to recreate the table
    // For now, just leave it
  }
};
