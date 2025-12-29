import { Migration } from './migration-runner';

export const migration_009: Migration = {
  id: 9,
  name: 'add_strategy_goals',
  up: (db) => {
    // Add goals column to business_strategies table
    db.exec(`
      ALTER TABLE business_strategies ADD COLUMN goals TEXT DEFAULT '[]';
    `);

    // Migrate existing primary_goal to goals array
    db.exec(`
      UPDATE business_strategies
      SET goals = '["' || primary_goal || '"]'
      WHERE goals IS NULL OR goals = '[]';
    `);
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily, so we'll leave it
  },
};
